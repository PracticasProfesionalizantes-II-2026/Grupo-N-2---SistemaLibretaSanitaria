import { verifyWebhookSignature } from "@/lib/mercadopago";
import { processMercadoPagoWebhookEvent } from "@/features/vet/lib/subscription-webhook";
import type { Json } from "@/types/supabase";

/**
 * Webhook de Mercado Pago para la suscripción Premium (D8 del diseño).
 *
 * Route Handler POST sin sesión: escribe con permisos de servicio a través de
 * `subscription-webhook.ts`.
 *
 * Deliberadamente delgado: verificar firma → delegar. Toda la lógica de
 * dedupe, reconsulta a Mercado Pago y aplicación de estado vive en
 * `subscription-webhook.ts`, donde se puede testear sin HTTP.
 *
 * Códigos de respuesta: `401` solo para firma inválida. Topic desconocido,
 * evento repetido, sin suscripción, evento desactualizado o id que Mercado
 * Pago ya no reconoce responden `200` — son resultados válidos de "no hay
 * nada que aplicar", no errores.
 *
 * Un error INTERNO no esperado (falla el insert de dedupe por algo que no es
 * `23505`, falla el `select`/`update` sobre `vet_subscriptions`) responde
 * `500` a propósito: el evento de `vet_subscription_events` ya quedó
 * insertado (dedupe), así que si acá se respondiera `200`, Mercado Pago
 * jamás reintentaría este evento — quedaría auditado con `applied: false`
 * para siempre, sin ninguna vía de recuperación. Un `500` es lo único que
 * hace que Mercado Pago reintente una falla transitoria nuestra.
 */
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  const dataId = url.searchParams.get("data.id");
  const topic = url.searchParams.get("type") ?? url.searchParams.get("topic");

  const verification = verifyWebhookSignature({
    signatureHeader,
    requestId,
    dataId,
  });

  if (!verification.valid) {
    return Response.json({ error: verification.reason }, { status: 401 });
  }

  // Firma válida pero sin los datos mínimos para saber qué reconsultar: no
  // hay nada que Mercado Pago vaya a reintentar con más información.
  if (!dataId || !topic) {
    return Response.json({ ok: true }, { status: 200 });
  }

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const providerEventId =
    body.id != null ? String(body.id) : (requestId ?? `${topic}:${dataId}`);
  const occurredAt =
    typeof body.date_created === "string" ? body.date_created : null;

  try {
    await processMercadoPagoWebhookEvent({
      topic,
      resourceId: dataId,
      providerEventId,
      payload: payload as Json,
      occurredAt,
    });
  } catch (error) {
    console.error("Error procesando webhook de Mercado Pago", error);
    // 500 a propósito: el evento de dedupe ya puede estar insertado, y solo
    // un código de error hace que Mercado Pago reintente esta entrega.
    return Response.json({ error: "error-interno" }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
}
