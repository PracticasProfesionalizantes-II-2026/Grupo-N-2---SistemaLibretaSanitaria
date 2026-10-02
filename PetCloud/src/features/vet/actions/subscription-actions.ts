"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { getCurrentPremiumPrice } from "@/features/vet/data/subscription";
import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import {
  getPremiumState,
  requireInstitutionOwner,
} from "@/features/vet/lib/vet-premium";
import {
  cancelPreapproval,
  createPreapproval,
  ensurePreapprovalPlan,
} from "@/lib/mercadopago";
import { getSiteUrl } from "@/lib/site-url";
import { sql } from "drizzle-orm";

import { getDb, query, withServiceRole } from "@/lib/db";

/**
 * Alta y baja de la suscripción Premium (fase 6). Escribe siempre con
 * `withServiceRole()` porque ninguna de las dos tablas que toca
 * (`premium_prices`, `vet_subscriptions`) tiene política de escritura para
 * `authenticated` (D1/D2 del diseño) — la autorización la da
 * `requireInstitutionOwner()`, no RLS.
 */

const GENERIC_ERROR = "No pudimos procesar el pago. Probá de nuevo.";
const CANCEL_ERROR =
  "No pudimos procesar la cancelación en Mercado Pago. Probá de nuevo.";

/**
 * Arranca (o retoma) el checkout de Mercado Pago para esta institución.
 *
 * Solo el titular (`requireInstitutionOwner()`). Nunca escribe el estado
 * Premium en sí — eso lo hace únicamente el webhook (fase 4) cuando Mercado
 * Pago confirma el pago; acá solo se deja la fila en `pending` y se redirige.
 */
export async function startPremiumCheckout(): Promise<
  ActionResult<{ initPoint: string }>
> {
  const vet = await requireInstitutionOwner();

  const premium = await getPremiumState(vet.institucionId);
  if (premium.activo) {
    return { success: false, error: "Esta institución ya es Premium." };
  }

  const price = await getCurrentPremiumPrice();
  if (!price) {
    return {
      success: false,
      error:
        "Todavía no hay un precio Premium configurado. Escribinos para coordinar el alta.",
    };
  }

  const siteUrl = await getSiteUrl();
  const backUrl = `${siteUrl}/veterinaria/premium`;

  let planId = price.mpPreapprovalPlanId;

  // Lazy: el primer checkout a este precio crea el plan en Mercado Pago y lo
  // guarda con la service role (D4 del diseño; `premium_prices` no tiene
  // política de UPDATE para `authenticated`).
  if (!planId) {
    const plan = await ensurePreapprovalPlan({
      existingPlanId: null,
      reason: "PetCloud Premium",
      amountCents: price.amountCents,
      currency: price.currency,
      backUrl,
    });

    if (!plan.success) {
      return {
        success: false,
        error: `No se pudo preparar el plan de pago: ${plan.error}`,
      };
    }

    planId = plan.data.id;

    try {
      await withServiceRole((tx) =>
        tx.execute(
          sql`update premium_prices set mp_preapproval_plan_id = ${planId} where id = ${price.id}`,
        ),
      );
    } catch {
      return { success: false, error: GENERIC_ERROR };
    }
  }

  // Si ya había una fila (checkout pendiente o re-suscripción) se reutiliza y
  // se actualiza al precio vigente; si no, se crea en `pending`.
  let subscriptionId: string;
  try {
    const [fila] = await withServiceRole((tx) =>
      query<{ id: string }>(
        tx,
        sql`insert into vet_subscriptions (institution_id, price_id,
              amount_cents, currency, status, created_by)
            values (${vet.institucionId}, ${price.id}, ${price.amountCents},
              ${price.currency}, 'pending', ${vet.usuario.id})
            on conflict (institution_id) do update set
              price_id = excluded.price_id,
              amount_cents = excluded.amount_cents,
              currency = excluded.currency,
              status = 'pending',
              provider_subscription_id = null,
              cancelled_at = null
            returning id`,
      ),
    );
    subscriptionId = fila.id;
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  const preapproval = await createPreapproval({
    preapprovalPlanId: planId,
    payerEmail: vet.usuario.email,
    externalReference: subscriptionId,
    backUrl,
  });

  if (!preapproval.success) {
    return {
      success: false,
      error: `Mercado Pago no pudo iniciar el pago: ${preapproval.error}`,
    };
  }

  if (!preapproval.data.init_point) {
    return { success: false, error: GENERIC_ERROR };
  }

  // Guarda el id de Mercado Pago ANTES de redirigir: es lo que el webhook usa
  // para encontrar esta fila (`provider_subscription_id`, migración 040).
  try {
    await withServiceRole((tx) =>
      tx.execute(
        sql`update vet_subscriptions set provider_subscription_id = ${preapproval.data.id} where id = ${subscriptionId}`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath("/veterinaria/premium");
  return { success: true, initPoint: preapproval.data.init_point };
}

/**
 * Cancela la suscripción en Mercado Pago. **No** escribe el estado local de
 * forma optimista: el estado real (`status`, `current_period_end`) solo
 * cambia cuando llega el webhook correspondiente (fase 4) — la veterinaria
 * sigue viendo "Premium" hasta que Mercado Pago confirme la baja, tal como
 * indica el diseño (Open Questions).
 */
export async function cancelPremium(): Promise<ActionResult> {
  const vet = await requireInstitutionOwner();

  let subscription: { provider_subscription_id: string | null } | undefined;
  try {
    [subscription] = await query<{ provider_subscription_id: string | null }>(
      getDb(),
      sql`select provider_subscription_id from vet_subscriptions
           where institution_id = ${vet.institucionId} limit 1`,
    );
  } catch {
    return { success: false, error: CANCEL_ERROR };
  }

  if (!subscription?.provider_subscription_id) {
    return {
      success: false,
      error: "No encontramos una suscripción de Mercado Pago para cancelar.",
    };
  }

  const result = await cancelPreapproval(subscription.provider_subscription_id);

  if (!result.success) {
    return {
      success: false,
      error: `Mercado Pago no pudo procesar la cancelación: ${result.error}`,
    };
  }

  return { success: true };
}
