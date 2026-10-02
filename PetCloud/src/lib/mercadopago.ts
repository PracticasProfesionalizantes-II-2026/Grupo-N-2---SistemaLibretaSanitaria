import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cliente de Mercado Pago para la suscripción Premium de las veterinarias.
 *
 * Sin SDK: `fetch` crudo contra la API REST,
 * porque lo que se necesita es un puñado de endpoints, no la superficie
 * entera del SDK oficial. Nunca se importa desde un componente cliente — el
 * access token no puede llegar al navegador — y ninguna función acá dentro
 * finge éxito cuando falta la configuración: siempre se devuelve el error
 * explícito (`MpResult`/`{ valid: false }`), nunca un valor por defecto
 * silencioso.
 *
 * El estado real de una suscripción nunca sale de acá: este módulo solo habla
 * con la API de Mercado Pago. Quien decide qué hacer con la respuesta (la
 * máquina de estados, el webhook, las acciones de checkout) vive en
 * `features/vet/`.
 */

const BASE_URL = "https://api.mercadopago.com";

/** Ventana de frescura del webhook: un `ts` más viejo (o del futuro) que esto se rechaza. */
const WEBHOOK_FRESHNESS_WINDOW_SECONDS = 300;

export type MpResult<T> =
  { success: true; data: T } | { success: false; error: string };

async function mpFetch<T>(
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown },
): Promise<MpResult<T>> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  // Sin token no se finge una llamada exitosa.
  if (!accessToken) {
    return {
      success: false,
      error: "Falta MERCADOPAGO_ACCESS_TOKEN. Cargala en .env.local.",
    };
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Mercado Pago ${res.status}: ${await res.text()}`,
      };
    }

    const data = (await res.json()) as T;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export type PreapprovalPlan = {
  id: string;
};

/**
 * Un plan por precio (D4 del diseño), creado la primera vez que alguien se
 * suscribe a ese precio. Si ya existe (`existingPlanId` viene de
 * `premium_prices.mp_preapproval_plan_id`) no se llama a la red: la
 * no-retroactividad la garantiza el propio modelo de datos de Mercado Pago,
 * no una relectura nuestra.
 */
export async function ensurePreapprovalPlan(input: {
  existingPlanId?: string | null;
  reason: string;
  amountCents: number;
  backUrl: string;
  currency?: string;
}): Promise<MpResult<PreapprovalPlan>> {
  if (input.existingPlanId) {
    return { success: true, data: { id: input.existingPlanId } };
  }

  return mpFetch<PreapprovalPlan>("/preapproval_plan", {
    method: "POST",
    body: {
      reason: input.reason,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.amountCents / 100,
        currency_id: input.currency ?? "ARS",
      },
    },
  });
}

export type Preapproval = {
  id: string;
  status: string;
  init_point?: string;
  last_modified?: string;
};

/**
 * Suscribe a una veterinaria a un plan existente. Sin `card_token_id`,
 * Mercado Pago devuelve `init_point`: la propia veterinaria completa el medio
 * de pago en la página de Mercado Pago, nunca en PetCloud.
 */
export async function createPreapproval(input: {
  preapprovalPlanId: string;
  payerEmail: string;
  externalReference: string;
  backUrl: string;
}): Promise<MpResult<Preapproval>> {
  return mpFetch<Preapproval>("/preapproval", {
    method: "POST",
    body: {
      preapproval_plan_id: input.preapprovalPlanId,
      payer_email: input.payerEmail,
      external_reference: input.externalReference,
      back_url: input.backUrl,
      status: "pending",
    },
  });
}

/**
 * El estado autoritativo de una suscripción. El webhook solo dispara esta
 * lectura (D8 del diseño): nunca se aplica un cambio de estado a partir del
 * body del POST, siempre de lo que devuelve esta llamada.
 */
export async function getPreapproval(
  id: string,
): Promise<MpResult<Preapproval>> {
  return mpFetch<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export type AuthorizedPayment = {
  id: string;
  preapproval_id: string;
  status: string;
  date_created?: string;
};

/**
 * El cobro puntual de un ciclo de la suscripción. Un `status: "rejected"`
 * acá es lo que dispara `past_due` en la máquina de estados del webhook.
 */
export async function getAuthorizedPayment(
  id: string,
): Promise<MpResult<AuthorizedPayment>> {
  return mpFetch<AuthorizedPayment>(
    `/authorized_payments/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
}

/** Cancela la suscripción en Mercado Pago. Nuestro estado se actualiza recién cuando llega el webhook — sin escritura optimista (ver Open Questions del diseño). */
export async function cancelPreapproval(
  id: string,
): Promise<MpResult<Preapproval>> {
  return mpFetch<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { status: "cancelled" },
  });
}

type WebhookSignatureInvalidReason =
  "sin-firma" | "formato" | "vencida" | "no-coincide" | "sin-secreto";

export type WebhookSignatureResult =
  { valid: true } | { valid: false; reason: WebhookSignatureInvalidReason };

/** Extrae `ts` y `v1` del header `x-signature: ts=<unix>,v1=<hex>`. */
function parseSignatureHeader(
  header: string,
): { ts: string; v1: string } | null {
  let ts: string | undefined;
  let v1: string | undefined;

  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;

    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();

    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }

  if (!ts || !v1) return null;
  return { ts, v1 };
}

/**
 * Verifica que el POST al webhook realmente venga de Mercado Pago.
 *
 * Mecanismo real documentado por Mercado Pago, no inventado: el manifest se
 * arma literalmente como `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` y
 * se firma con HMAC-SHA256 usando la clave secreta del webhook (generada en
 * el dashboard de MP al registrar la URL, distinta del access token). La
 * comparación usa `timingSafeEqual` — nunca `===` sobre el hash, que es
 * vulnerable a timing attack — y antes de eso se comparan los largos de los
 * buffers: `timingSafeEqual` explota si no son exactamente iguales, y un
 * atacante controla el largo de `v1`.
 */
export function verifyWebhookSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}): WebhookSignatureResult {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    return { valid: false, reason: "sin-secreto" };
  }

  if (!input.signatureHeader) {
    return { valid: false, reason: "sin-firma" };
  }

  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed || !input.requestId || !input.dataId) {
    return { valid: false, reason: "formato" };
  }

  const tsNumber = Number(parsed.ts);
  if (!Number.isFinite(tsNumber)) {
    return { valid: false, reason: "formato" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsNumber) > WEBHOOK_FRESHNESS_WINDOW_SECONDS) {
    return { valid: false, reason: "vencida" };
  }

  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${parsed.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const received = Buffer.from(parsed.v1, "hex");

  // Largos distintos primero: evita el crash de `timingSafeEqual` y ya alcanza
  // para rechazar, porque `expected` siempre mide 32 bytes (SHA-256).
  if (received.length !== expected.length) {
    return { valid: false, reason: "no-coincide" };
  }

  if (!timingSafeEqual(received, expected)) {
    return { valid: false, reason: "no-coincide" };
  }

  return { valid: true };
}
