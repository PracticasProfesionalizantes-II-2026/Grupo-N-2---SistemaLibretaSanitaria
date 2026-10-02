import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { sql } from "drizzle-orm";

import { getDb, query, rpc } from "@/lib/db";
import { requireVet, type VetSession } from "@/features/vet/lib/vet-session";

/**
 * Los estados relevantes de la suscripción Premium de una institución, de
 * cara a la aplicación — no los cinco valores crudos de
 * `vet_subscriptions.status` (migración 040).
 *
 * `"vencido"` cubre todo lo que hoy NO da acceso pero alguna vez tuvo una fila
 * en `vet_subscriptions`: autorizada con el período ya vencido (rezago del
 * webhook), en mora fuera de los 7 días de gracia, cancelada con el período
 * pagado ya terminado, un cobro rechazado (`rejected`) o un checkout todavía
 * sin confirmar (`pending`). La pantalla de facturación (fase 6) lee el
 * detalle fino directamente de `vet_subscriptions` cuando lo necesita; acá
 * solo importa "¿el módulo está disponible ahora, y hasta cuándo?".
 * `"sin_suscripcion"` es el único caso sin ninguna fila todavía.
 */
type PremiumEstado =
  "activo" | "en_gracia" | "cancelado" | "vencido" | "sin_suscripcion";

export type PremiumState = {
  /**
   * Espejo exacto de `institution_has_premium()` (migración 040, `SECURITY
   * DEFINER`): nunca se reimplementa esa cuenta acá, se la consulta. Es la
   * misma función que consulta la política de `appointments` (041), así que
   * la aplicación y la base nunca pueden divergir sobre si una institución
   * tiene Premium en este momento.
   */
  activo: boolean;
  estado: PremiumEstado;
  /** Fecha límite relevante para `estado`, o `null` si no aplica. */
  hasta: string | null;
};

/**
 * El estado Premium de una institución, con el detalle que
 * `institution_has_premium()` no expone (para poder mostrar "en gracia hasta
 * el DD/MM" en vez de un simple sí/no).
 *
 * Envuelta en `cache()` de React: `getVetSession()` la llama una vez por
 * institución y, más adelante, la pantalla de facturación (fase 6) la vuelve
 * a pedir sin pagar una segunda consulta en el mismo render — mismo criterio
 * que `getVetSession()`/`getCurrentUser()`.
 */
export const getPremiumState = cache(
  async (institutionId: string): Promise<PremiumState> => {
    const db = getDb();
    const [[fila], [suscripcion]] = await Promise.all([
      rpc<{ institution_has_premium: boolean | null }>(
        db,
        "institution_has_premium",
        { p_institution_id: institutionId },
      ),
      query<{
        status: string;
        grace_until: string | null;
        current_period_end: string | null;
      }>(
        db,
        sql`select status, grace_until, current_period_end
              from vet_subscriptions where institution_id = ${institutionId}
             limit 1`,
      ),
    ]);
    const activo = fila?.institution_has_premium;

    if (!suscripcion) {
      return { activo: false, estado: "sin_suscripcion", hasta: null };
    }

    const esPremium = activo ?? false;

    switch (suscripcion.status) {
      case "authorized":
        return {
          activo: esPremium,
          estado: esPremium ? "activo" : "vencido",
          hasta: suscripcion.current_period_end,
        };
      case "past_due":
        return {
          activo: esPremium,
          estado: esPremium ? "en_gracia" : "vencido",
          hasta: suscripcion.grace_until,
        };
      case "cancelled":
        return {
          activo: esPremium,
          estado: esPremium ? "cancelado" : "vencido",
          hasta: suscripcion.current_period_end,
        };
      default:
        // 'pending' (checkout sin confirmar) y 'rejected' (cobro rechazado
        // antes de autorizar ningún período) nunca habilitaron el módulo.
        return { activo: false, estado: "vencido", hasta: null };
    }
  },
);

/**
 * Para las pantallas y acciones que solo tienen sentido con el módulo pago:
 * turnos (fases 8/9) y todo lo que dependa de `appointments`.
 *
 * Mismo estilo que `requireVet()`: no hay nada anómalo en llegar acá sin
 * Premium (es el caso normal de cualquier veterinaria que no se suscribió, o
 * que dejó de pagar), así que corta con un redirect a la pantalla de
 * facturación en vez de una excepción — igual que `requireVet()` corta con un
 * redirect a `/login` en vez de tirar un error por falta de sesión.
 */
export async function requirePremiumVet(): Promise<VetSession> {
  const session = await requireVet();

  if (!session.premium.activo) redirect("/veterinaria/premium");

  return session;
}

/**
 * Para las acciones que además exigen ser el titular de la institución (dar
 * de alta o cancelar la suscripción, fase 6): mismo criterio que
 * `requireMunicipalityRole()` del lado municipal.
 *
 * Llegar hasta acá autenticado, con ficha profesional, pero sin
 * `role_in_institution = 'owner'` no es un flujo esperado — la UI ya oculta
 * los controles de facturación para quien no es titular (mismo criterio que
 * `soyTitular` en `institution-actions.ts` para el botón de invitar
 * profesionales) — así que corta con una excepción en vez de un redirect
 * silencioso, igual que `requireMunicipalityRole()`.
 */
export async function requireInstitutionOwner(): Promise<VetSession> {
  const session = await requireVet();

  if (session.rolEnInstitucion !== "owner") {
    throw new Error(
      `requireInstitutionOwner: se necesita "owner" y la sesión tiene "${session.rolEnInstitucion}".`,
    );
  }

  return session;
}
