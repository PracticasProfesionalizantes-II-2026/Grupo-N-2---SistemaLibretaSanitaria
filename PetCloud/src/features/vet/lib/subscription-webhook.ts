import "server-only";

import { getAuthorizedPayment, getPreapproval } from "@/lib/mercadopago";
import { sql } from "drizzle-orm";

import { query, withServiceRole } from "@/lib/db";
import type { Json } from "@/types/supabase";

/**
 * Máquina de estados y orquestación del webhook de Mercado Pago (D8 del
 * diseño): la autenticidad de la firma la resuelve `route.ts`, pero todo lo
 * que toca la base y la lógica de transición vive acá, para que se pueda
 * testear sin levantar un servidor HTTP.
 *
 * El body del POST nunca es la fuente de verdad del estado — solo dispara qué
 * volver a consultar. `applyMercadoPagoEvent` decide siempre a partir del
 * recurso ya reobtenido de la API de Mercado Pago (`resource.status`,
 * `resource.last_modified`/`date_created`), nunca del payload entrante.
 */

const KNOWN_TOPICS = new Set([
  "subscription_preapproval",
  "subscription_authorized_payment",
]);

const GRACE_PERIOD_DAYS = 7;

type SubscriptionStatus =
  "pending" | "authorized" | "past_due" | "cancelled" | "rejected";

type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  cancelledAt: string | null;
  providerUpdatedAt: string | null;
};

type PreapprovalResourceEvent = {
  kind: "preapproval";
  status: string;
  lastModified: string | null;
};

type AuthorizedPaymentResourceEvent = {
  kind: "authorized_payment";
  status: string;
  occurredAt: string | null;
};

type MercadoPagoResourceEvent =
  PreapprovalResourceEvent | AuthorizedPaymentResourceEvent;

type SubscriptionChanges = Partial<{
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  cancelledAt: string | null;
  providerUpdatedAt: string;
}>;

type SubscriptionEffect =
  | { applied: false; reason: string }
  | { applied: true; changes: SubscriptionChanges };

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Puro y sin efectos: decide qué cambia en `vet_subscriptions` a partir del
 * estado guardado y del recurso ya verificado/reobtenido de Mercado Pago.
 *
 * Guarda de orden (evento fuera de orden, caso adversarial): si ya existe un
 * `providerUpdatedAt` guardado, el recurso entrante tiene que traer una marca
 * de tiempo más nueva. Sin esa marca no hay forma de saber si el evento es
 * viejo, así que se rechaza por seguridad en vez de aplicarlo a ciegas.
 */
function applyMercadoPagoEvent(
  current: SubscriptionSnapshot,
  event: MercadoPagoResourceEvent,
): SubscriptionEffect {
  const resourceTimestamp =
    event.kind === "preapproval" ? event.lastModified : event.occurredAt;

  if (current.providerUpdatedAt) {
    if (!resourceTimestamp) {
      return { applied: false, reason: "sin-timestamp-de-referencia" };
    }

    if (
      new Date(resourceTimestamp).getTime() <=
      new Date(current.providerUpdatedAt).getTime()
    ) {
      return { applied: false, reason: "evento-desactualizado" };
    }
  }

  const providerUpdatedAt = resourceTimestamp ?? new Date().toISOString();

  if (event.kind === "preapproval") {
    if (event.status === "authorized") {
      return {
        applied: true,
        changes: { status: "authorized", providerUpdatedAt },
      };
    }

    if (event.status === "cancelled") {
      // current_period_end se preserva a propósito (regla del diseño): al no
      // incluirla en `changes`, la columna se queda con el valor que ya tenía.
      return {
        applied: true,
        changes: {
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
          providerUpdatedAt,
        },
      };
    }

    return {
      applied: false,
      reason: `preapproval-status-no-manejado:${event.status}`,
    };
  }

  if (event.status === "approved") {
    return {
      applied: true,
      changes: {
        status: "authorized",
        graceUntil: null,
        currentPeriodEnd: addMonths(new Date(), 1).toISOString(),
        providerUpdatedAt,
      },
    };
  }

  if (event.status === "rejected") {
    return {
      applied: true,
      changes: {
        status: "past_due",
        graceUntil: addDays(new Date(), GRACE_PERIOD_DAYS).toISOString(),
        providerUpdatedAt,
      },
    };
  }

  return {
    applied: false,
    reason: `pago-status-no-manejado:${event.status}`,
  };
}

export type WebhookOutcome =
  | { outcome: "topic-desconocido" }
  | { outcome: "duplicado" }
  | { outcome: "sin-suscripcion" }
  | { outcome: "recurso-no-encontrado" }
  | { outcome: "evento-desactualizado" }
  | { outcome: "aplicado"; status: SubscriptionStatus };

/**
 * Orquesta un evento ya autenticado por la firma: inserta en
 * `vet_subscription_events` para el dedupe (el choque `23505` en la
 * constraint `UNIQUE (provider, provider_event_id)` es la señal), vuelve a
 * pedirle el recurso real a Mercado Pago y recién ahí aplica el efecto.
 *
 * Usa `withServiceRole()` porque nada de esto corre en el contexto de una
 * sesión de usuario.
 */
export async function processMercadoPagoWebhookEvent(input: {
  topic: string;
  resourceId: string;
  providerEventId: string;
  payload: Json;
  occurredAt?: string | null;
}): Promise<WebhookOutcome> {
  if (!KNOWN_TOPICS.has(input.topic)) {
    return { outcome: "topic-desconocido" };
  }

  // `on conflict do nothing`: si la fila ya existía, ya se procesó este mismo
  // evento antes. Es la señal de dedupe (diseño D: idempotencia).
  const insertado = await withServiceRole((tx) =>
    query(
      tx,
      sql`insert into vet_subscription_events (provider, provider_event_id,
            topic, resource_id, payload, occurred_at)
          values ('mercadopago', ${input.providerEventId}, ${input.topic},
            ${input.resourceId}, ${JSON.stringify(input.payload)}::jsonb,
            ${input.occurredAt ?? null})
          on conflict (provider, provider_event_id) do nothing
          returning id`,
    ),
  );
  if (insertado.length === 0) return { outcome: "duplicado" };

  // A partir de acá el body del POST ya cumplió su único rol: disparar qué
  // volver a consultar. El estado real sale siempre de esta llamada.
  const resource =
    input.topic === "subscription_preapproval"
      ? await getPreapproval(input.resourceId)
      : await getAuthorizedPayment(input.resourceId);

  if (!resource.success) {
    // Id que Mercado Pago ya no reconoce: queda auditado en el evento
    // (`applied` en falso, tal como quedó insertado), pero no se toca la
    // suscripción — no hay ningún dato autoritativo con el cual actualizarla.
    return { outcome: "recurso-no-encontrado" };
  }

  const preapprovalId =
    input.topic === "subscription_preapproval"
      ? input.resourceId
      : (resource.data as { preapproval_id: string }).preapproval_id;

  const [subscription] = await withServiceRole((tx) =>
    query<{
      id: string;
      status: string;
      current_period_end: string | null;
      grace_until: string | null;
      cancelled_at: string | null;
      provider_updated_at: string | null;
    }>(
      tx,
      sql`select id, status, current_period_end, grace_until, cancelled_at,
                 provider_updated_at
            from vet_subscriptions
           where provider_subscription_id = ${preapprovalId} limit 1`,
    ),
  );

  if (!subscription) {
    return { outcome: "sin-suscripcion" };
  }

  const event: MercadoPagoResourceEvent =
    input.topic === "subscription_preapproval"
      ? {
          kind: "preapproval",
          status: (resource.data as { status: string }).status,
          lastModified:
            (resource.data as { last_modified?: string }).last_modified ?? null,
        }
      : {
          kind: "authorized_payment",
          status: (resource.data as { status: string }).status,
          occurredAt:
            (resource.data as { date_created?: string }).date_created ?? null,
        };

  const current: SubscriptionSnapshot = {
    status: subscription.status as SubscriptionStatus,
    currentPeriodEnd: subscription.current_period_end,
    graceUntil: subscription.grace_until,
    cancelledAt: subscription.cancelled_at,
    providerUpdatedAt: subscription.provider_updated_at,
  };

  const effect = applyMercadoPagoEvent(current, event);

  if (!effect.applied) {
    return { outcome: "evento-desactualizado" };
  }

  const c = effect.changes;
  await withServiceRole(async (tx) => {
    await tx.execute(sql`
      update vet_subscriptions set
        status = coalesce(${c.status ?? null}, status),
        current_period_end = case when ${c.currentPeriodEnd !== undefined}
          then ${c.currentPeriodEnd ?? null}::timestamptz else current_period_end end,
        grace_until = case when ${c.graceUntil !== undefined}
          then ${c.graceUntil ?? null}::timestamptz else grace_until end,
        cancelled_at = case when ${c.cancelledAt !== undefined}
          then ${c.cancelledAt ?? null}::timestamptz else cancelled_at end,
        provider_updated_at = case when ${c.providerUpdatedAt !== undefined}
          then ${c.providerUpdatedAt ?? null}::timestamptz else provider_updated_at end
      where id = ${subscription.id}`);

    await tx.execute(sql`
      update vet_subscription_events set
        applied = true,
        subscription_id = ${subscription.id},
        provider_status = ${event.status}
      where provider = 'mercadopago'
        and provider_event_id = ${input.providerEventId}`);
  });

  return {
    outcome: "aplicado",
    status: effect.changes.status ?? current.status,
  };
}
