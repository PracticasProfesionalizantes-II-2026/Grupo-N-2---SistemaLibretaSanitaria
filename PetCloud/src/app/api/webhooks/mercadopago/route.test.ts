import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/mercadopago/route";
import { processMercadoPagoWebhookEvent } from "@/features/vet/lib/subscription-webhook";

/**
 * Route Handler del webhook: firma real (`verifyWebhookSignature` sin mockear)
 * y el procesamiento (`processMercadoPagoWebhookEvent`, que toca la base y la
 * API de Mercado Pago) mockeado. Lo que se prueba acá es el contrato HTTP:
 * 401 con firma inválida, 200 si no hay nada que hacer, 500 ante un error
 * interno para que Mercado Pago reintente.
 */

vi.mock("@/features/vet/lib/subscription-webhook", () => ({
  processMercadoPagoWebhookEvent: vi.fn(),
}));

const WEBHOOK_SECRET_ORIGINAL = process.env.MERCADOPAGO_WEBHOOK_SECRET;
const SECRET = "clave-secreta-de-prueba";
const REQUEST_ID = "req-abc-123";

function firmarValido(dataId: string, ts: number) {
  const manifest = `id:${dataId};request-id:${REQUEST_ID};ts:${ts};`;
  return createHmac("sha256", SECRET).update(manifest).digest("hex");
}

function construirRequest(input: {
  dataId: string;
  topic: string;
  eventId: string;
  signatureHeader: string;
}) {
  const url = `http://localhost/api/webhooks/mercadopago?data.id=${encodeURIComponent(
    input.dataId,
  )}&type=${encodeURIComponent(input.topic)}`;

  return new Request(url, {
    method: "POST",
    headers: {
      "x-signature": input.signatureHeader,
      "x-request-id": REQUEST_ID,
    },
    body: JSON.stringify({
      id: input.eventId,
      type: input.topic,
      data: { id: input.dataId },
    }),
  });
}

function requestFirmado(dataId: string, topic = "subscription_preapproval") {
  const ts = Math.floor(Date.now() / 1000);
  return construirRequest({
    dataId,
    topic,
    eventId: `evt-${dataId}`,
    signatureHeader: `ts=${ts},v1=${firmarValido(dataId, ts)}`,
  });
}

beforeEach(() => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
  vi.mocked(processMercadoPagoWebhookEvent).mockReset();
});

afterEach(() => {
  if (WEBHOOK_SECRET_ORIGINAL === undefined) {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  } else {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = WEBHOOK_SECRET_ORIGINAL;
  }
});

describe("POST /api/webhooks/mercadopago", () => {
  it("firma forjada: 401 y no procesa nada", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const response = await POST(
      construirRequest({
        dataId: "preapproval-1",
        topic: "subscription_preapproval",
        eventId: "evt-forjado",
        signatureHeader: `ts=${ts},v1=${"0".repeat(64)}`,
      }),
    );

    expect(response.status).toBe(401);
    expect(processMercadoPagoWebhookEvent).not.toHaveBeenCalled();
  });

  it("firma válida: delega el evento con los datos del request", async () => {
    vi.mocked(processMercadoPagoWebhookEvent).mockResolvedValue({
      outcome: "aplicado",
      status: "authorized",
    });

    const response = await POST(requestFirmado("preapproval-1"));

    expect(response.status).toBe(200);
    expect(processMercadoPagoWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "subscription_preapproval",
        resourceId: "preapproval-1",
        providerEventId: "evt-preapproval-1",
      }),
    );
  });

  it("un resultado sin efecto (duplicado, topic desconocido) responde 200", async () => {
    vi.mocked(processMercadoPagoWebhookEvent).mockResolvedValue({
      outcome: "duplicado",
    });

    const response = await POST(requestFirmado("preapproval-1"));

    expect(response.status).toBe(200);
  });

  it("un error interno responde 500, para que Mercado Pago reintente", async () => {
    vi.mocked(processMercadoPagoWebhookEvent).mockRejectedValue(
      new Error("timeout de conexión a la base"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(requestFirmado("preapproval-1"));

    expect(response.status).toBe(500);
  });
});
