import "server-only";

import { sql } from "drizzle-orm";

import { getDb, query } from "@/lib/db";

/** Lecturas de la pantalla de facturación (`/veterinaria/premium`). */

export type CurrentPremiumPrice = {
  id: string;
  amountCents: number;
  currency: string;
  mpPreapprovalPlanId: string | null;
};

/**
 * El precio vigente: el de `effective_from` más reciente. `null` si nunca se
 * cargó ninguno — es la señal que oculta "Hacerme Premium".
 */
export async function getCurrentPremiumPrice(): Promise<CurrentPremiumPrice | null> {
  const [data] = await query<{
    id: string;
    amount_cents: number;
    currency: string;
    mp_preapproval_plan_id: string | null;
  }>(
    getDb(),
    sql`select id, amount_cents, currency, mp_preapproval_plan_id
          from premium_prices order by effective_from desc limit 1`,
  );
  if (!data) return null;

  return {
    id: data.id,
    amountCents: data.amount_cents,
    currency: data.currency,
    mpPreapprovalPlanId: data.mp_preapproval_plan_id,
  };
}

/** Los cinco valores crudos de `vet_subscriptions.status` (migración 040). */
type SubscriptionStatus =
  "pending" | "authorized" | "past_due" | "cancelled" | "rejected";

export type InstitutionSubscription = {
  status: SubscriptionStatus;
  amountCents: number;
  currency: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  cancelledAt: string | null;
};

/** La suscripción de la institución, o `null` si nunca se suscribió. */
export async function getInstitutionSubscription(
  institutionId: string,
): Promise<InstitutionSubscription | null> {
  const [data] = await query<{
    status: SubscriptionStatus;
    amount_cents: number;
    currency: string;
    current_period_end: string | null;
    grace_until: string | null;
    cancelled_at: string | null;
  }>(
    getDb(),
    sql`select status, amount_cents, currency, current_period_end,
               grace_until, cancelled_at
          from vet_subscriptions where institution_id = ${institutionId}
         limit 1`,
  );
  if (!data) return null;

  return {
    status: data.status,
    amountCents: data.amount_cents,
    currency: data.currency,
    currentPeriodEnd: data.current_period_end,
    graceUntil: data.grace_until,
    cancelledAt: data.cancelled_at,
  };
}
