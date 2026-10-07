"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { getCurrentPremiumPrice } from "@/features/vet/data/subscription";
import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import {
  getPremiumState,
  requireInstitutionOwner,
} from "@/features/vet/lib/vet-premium";
import { sql } from "drizzle-orm";

import { withServiceRole } from "@/lib/db";

/**
 * Alta de Premium **simulada**: activa el módulo sin cobrar un peso.
 *
 * PetCloud es una demo universitaria: no hay pasarela de pago real. Este es
 * el único camino de alta de Premium, y la pantalla lo anuncia como
 * "Pago simulado (demo)".
 *
 * Por qué esto escribe de verdad en la base, en vez de mover una bandera en el
 * cliente: el candado del panel no es una decisión de la interfaz. `has_access()`
 * (migración 100) llama a `institution_has_premium()` (migración 040) dentro de
 * las políticas de RLS del ERP, en **cada** consulta. Una simulación que solo
 * cambiara la pantalla abriría el menú mientras todas las consultas siguen
 * devolviendo vacío: una interfaz que miente sobre lo que el usuario tiene.
 * Por eso lo que se simula es el cobro, no el acceso — la fila de
 * `vet_subscriptions` que se escribe acá es una fila real que satisface a
 * `institution_has_premium()`.
 *
 * Escribe con `withServiceRole()` porque `vet_subscriptions` no tiene ninguna política de
 * INSERT ni de UPDATE para `authenticated` (migración 040), así que el cliente
 * de sesión no puede tocarla ni siendo titular. La autorización acá la da
 * `requireInstitutionOwner()`, no RLS.
 */

const GENERIC_ERROR =
  "No pudimos activar la simulación de Premium. Probá de nuevo.";

const SIN_PRECIO =
  "Todavía no hay un precio Premium configurado. Escribinos para coordinar el alta.";

/** Cuánto dura el período que otorga la simulación: un mes, como el real. */
const DIAS_DEL_PERIODO = 30;

/**
 * La demora falsa del "procesando".
 *
 * Dos segundos, el mismo criterio que el cobro simulado de una venta
 * (`erp/components/sales/payment-simulation-modal.tsx`): alcanza para que el
 * paso intermedio se vea y no tanto como para que parezca colgado. No está
 * medido contra ninguna pasarela real, porque acá no hay ninguna pasarela.
 */
const DEMORA_SIMULADA_MS = 2000;

/**
 * El prefijo que delata que esta fila nunca pasó por una caja.
 *
 * `vet_subscriptions.provider` tiene `CHECK (provider IN ('mercadopago'))`
 * (migración 040), así que una fila simulada **no puede** declarar otro
 * proveedor sin una migración — y las migraciones `0xx` son territorio del
 * otro desarrollador. La salida es un compromiso deliberado y marcado: se
 * escribe el único `provider` que la constraint admite, y la honestidad del
 * dato queda en `provider_subscription_id`, que arranca con `SIMULADO-` y es
 * imposible de confundir con un id de un proveedor real.
 *
 * El arreglo limpio es una migración que agregue `'simulado'` al CHECK, para
 * que el dato diga lo que es sin depender de una convención de texto. Queda
 * pendiente de acordarlo con quien maneja las migraciones `0xx`.
 */
const PREFIJO_SIMULADO = "SIMULADO-";

function nuevoIdSimulado(): string {
  return `${PREFIJO_SIMULADO}${crypto.randomUUID()}`;
}

/**
 * Activa Premium para la institución del titular, sin cobro.
 *
 * Devuelve el mismo `ActionResult` que el resto de las acciones del panel.
 */
export async function simulatePremiumCheckout(): Promise<ActionResult> {
  const vet = await requireInstitutionOwner();

  const premium = await getPremiumState(vet.institucionId);
  if (premium.activo) {
    return { success: false, error: "Esta institución ya es Premium." };
  }

  // Sin precio vigente no se escribe nada: `vet_subscriptions.price_id` es
  // `NOT NULL` y referencia a `premium_prices` (migración 040), así que no hay
  // ningún valor sensato que poner. Inventar uno sería dejar una fila que
  // afirma un importe que nadie fijó.
  const price = await getCurrentPremiumPrice();
  if (!price) {
    return { success: false, error: SIN_PRECIO };
  }

  await new Promise((resolve) => setTimeout(resolve, DEMORA_SIMULADA_MS));

  const periodoHasta = new Date();
  periodoHasta.setDate(periodoHasta.getDate() + DIAS_DEL_PERIODO);

  // `status = 'authorized'` con `current_period_end` en el futuro es
  // exactamente lo que `institution_has_premium()` (migración 040) espera.
  try {
    await withServiceRole((tx) =>
      tx.execute(sql`
        insert into vet_subscriptions (institution_id, created_by, price_id,
          amount_cents, currency, status, current_period_end, grace_until,
          cancelled_at, provider_subscription_id, provider_updated_at)
        values (${vet.institucionId}, ${vet.usuario.id}, ${price.id},
          ${price.amountCents}, ${price.currency}, 'authorized',
          ${periodoHasta.toISOString()}, null, null, ${nuevoIdSimulado()}, now())
        on conflict (institution_id) do update set
          price_id = excluded.price_id,
          amount_cents = excluded.amount_cents,
          currency = excluded.currency,
          status = excluded.status,
          current_period_end = excluded.current_period_end,
          grace_until = null,
          cancelled_at = null,
          provider_subscription_id = excluded.provider_subscription_id,
          provider_updated_at = excluded.provider_updated_at`),
    );
  } catch (error) {
    console.error("simulatePremiumCheckout", error);
    return { success: false, error: GENERIC_ERROR };
  }

  // El candado del sidebar sale de `session.premium`, que se arma en el layout
  // de `/veterinaria` (`getVetSession()` → `getPremiumState()`), no en la
  // página de Premium. Revalidar solo `/veterinaria/premium` refrescaría la
  // pantalla y dejaría el candado puesto hasta que alguien recargue a mano;
  // por eso se revalida el segmento con tipo `"layout"`, que es lo que vuelve
  // a ejecutar ese layout y, con él, todo lo que cuelga abajo — la propia
  // pantalla de Premium incluida.
  revalidatePath("/veterinaria", "layout");

  return { success: true };
}

/**
 * Baja simulada: marca la suscripción como cancelada. El acceso sigue hasta
 * `current_period_end`, igual que una baja real con el período ya pagado.
 */
export async function cancelPremiumSimulado(): Promise<ActionResult> {
  const vet = await requireInstitutionOwner();

  try {
    await withServiceRole((tx) =>
      tx.execute(sql`
        update vet_subscriptions
           set status = 'cancelled', cancelled_at = now(),
               provider_updated_at = now()
         where institution_id = ${vet.institucionId}`),
    );
  } catch (error) {
    console.error("cancelPremiumSimulado", error);
    return {
      success: false,
      error: "No pudimos cancelar la suscripción. Probá de nuevo.",
    };
  }

  revalidatePath("/veterinaria", "layout");

  return { success: true };
}
