import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelPreapproval,
  createPreapproval,
  ensurePreapprovalPlan,
  getAuthorizedPayment,
  getPreapproval,
  verifyWebhookSignature,
} from "@/lib/mercadopago";

// Nunca se pega contra la red real: siempre `fetch` mockeado o vectores de
// firma fijos calculados acá mismo con el mismo algoritmo que usa el módulo.

const ACCESS_TOKEN_ORIGINAL = process.env.MERCADOPAGO_ACCESS_TOKEN;
const WEBHOOK_SECRET_ORIGINAL = process.env.MERCADOPAGO_WEBHOOK_SECRET;

function setAccessToken(value: string | undefined) {
  if (value === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  else process.env.MERCADOPAGO_ACCESS_TOKEN = value;
}

function setWebhookSecret(value: string | undefined) {
  if (value === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  else process.env.MERCADOPAGO_WEBHOOK_SECRET = value;
}

afterEach(() => {
  setAccessToken(ACCESS_TOKEN_ORIGINAL);
  setWebhookSecret(WEBHOOK_SECRET_ORIGINAL);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("access token faltante (fail loud, nunca red real)", () => {
  beforeEach(() => {
    setAccessToken(undefined);
  });

  it("ensurePreapprovalPlan sin token devuelve error explícito y no llama a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensurePreapprovalPlan({
      reason: "Premium mensual",
      amountCents: 150000,
      backUrl: "http://localhost:3000/veterinaria/premium",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("MERCADOPAGO_ACCESS_TOKEN");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createPreapproval sin token devuelve error explícito y no llama a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPreapproval({
      preapprovalPlanId: "plan-1",
      payerEmail: "dueno@vet.com",
      externalReference: "sub-1",
      backUrl: "http://localhost:3000/veterinaria/premium",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("MERCADOPAGO_ACCESS_TOKEN");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ensurePreapprovalPlan", () => {
  beforeEach(() => {
    setAccessToken("test-access-token");
  });

  it("no llama a la red si ya existe mp_preapproval_plan_id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensurePreapprovalPlan({
      existingPlanId: "plan-existente",
      reason: "Premium mensual",
      amountCents: 150000,
      backUrl: "http://localhost:3000/veterinaria/premium",
    });

    expect(result).toEqual({ success: true, data: { id: "plan-existente" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("crea un plan nuevo con el monto convertido a pesos", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "plan-nuevo" }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensurePreapprovalPlan({
      reason: "Premium mensual",
      amountCents: 150000,
      backUrl: "http://localhost:3000/veterinaria/premium",
    });

    expect(result).toEqual({ success: true, data: { id: "plan-nuevo" } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval_plan");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-access-token",
    });
    const body = JSON.parse(init.body as string);
    expect(body.auto_recurring.transaction_amount).toBe(1500);
    expect(body.auto_recurring.currency_id).toBe("ARS");
  });

  it("propaga un status de error de Mercado Pago como fallo explícito", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })),
    );

    const result = await ensurePreapprovalPlan({
      reason: "Premium mensual",
      amountCents: 150000,
      backUrl: "http://localhost:3000/veterinaria/premium",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("400");
    }
  });
});

describe("createPreapproval", () => {
  beforeEach(() => {
    setAccessToken("test-access-token");
  });

  it("suscribe contra un plan existente y devuelve el init_point", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "preapproval-1",
          status: "pending",
          init_point: "https://mp/init",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPreapproval({
      preapprovalPlanId: "plan-1",
      payerEmail: "dueno@vet.com",
      externalReference: "sub-1",
      backUrl: "http://localhost:3000/veterinaria/premium",
    });

    expect(result).toEqual({
      success: true,
      data: {
        id: "preapproval-1",
        status: "pending",
        init_point: "https://mp/init",
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval");
    const body = JSON.parse(init.body as string);
    expect(body.preapproval_plan_id).toBe("plan-1");
    expect(body.external_reference).toBe("sub-1");
  });

  it("un throw de red se refleja como fallo explícito, no una excepción sin capturar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const result = await createPreapproval({
      preapprovalPlanId: "plan-1",
      payerEmail: "dueno@vet.com",
      externalReference: "sub-1",
      backUrl: "http://localhost:3000/veterinaria/premium",
    });

    expect(result).toEqual({ success: false, error: "network down" });
  });
});

describe("getPreapproval / getAuthorizedPayment / cancelPreapproval", () => {
  beforeEach(() => {
    setAccessToken("test-access-token");
  });

  it("getPreapproval hace GET al recurso por id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "preapproval-1", status: "authorized" }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPreapproval("preapproval-1");

    expect(result).toEqual({
      success: true,
      data: { id: "preapproval-1", status: "authorized" },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval/preapproval-1");
    expect(init.method).toBe("GET");
  });

  it("getAuthorizedPayment hace GET al pago autorizado por id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "pago-1",
          preapproval_id: "preapproval-1",
          status: "rejected",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAuthorizedPayment("pago-1");

    expect(result).toEqual({
      success: true,
      data: {
        id: "pago-1",
        preapproval_id: "preapproval-1",
        status: "rejected",
      },
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://api.mercadopago.com/authorized_payments/pago-1");
  });

  it("cancelPreapproval hace PUT con status cancelled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "preapproval-1", status: "cancelled" }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelPreapproval("preapproval-1");

    expect(result).toEqual({
      success: true,
      data: { id: "preapproval-1", status: "cancelled" },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval/preapproval-1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ status: "cancelled" });
  });
});

/** Firma un manifest con el mismo algoritmo que `verifyWebhookSignature`, para armar vectores fijos. */
function firmar(secret: string, manifest: string) {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

describe("verifyWebhookSignature", () => {
  const SECRET = "clave-secreta-de-prueba";
  const DATA_ID = "123456789";
  const REQUEST_ID = "req-abc-123";

  beforeEach(() => {
    setWebhookSecret(SECRET);
  });

  function vectorValido(tsOverride?: number) {
    const ts = tsOverride ?? Math.floor(Date.now() / 1000);
    const manifest = `id:${DATA_ID};request-id:${REQUEST_ID};ts:${ts};`;
    const v1 = firmar(SECRET, manifest);
    return {
      signatureHeader: `ts=${ts},v1=${v1}`,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
    };
  }

  it("RED: sin MERCADOPAGO_WEBHOOK_SECRET nunca finge aceptar", () => {
    setWebhookSecret(undefined);

    const result = verifyWebhookSignature(vectorValido());

    expect(result).toEqual({ valid: false, reason: "sin-secreto" });
  });

  it("rechaza cuando falta el header x-signature", () => {
    const result = verifyWebhookSignature({
      signatureHeader: null,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ valid: false, reason: "sin-firma" });
  });

  it("rechaza un header malformado (sin v1)", () => {
    const result = verifyWebhookSignature({
      signatureHeader: `ts=${Math.floor(Date.now() / 1000)}`,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ valid: false, reason: "formato" });
  });

  it("rechaza cuando falta x-request-id o data.id", () => {
    const vector = vectorValido();

    expect(verifyWebhookSignature({ ...vector, requestId: null })).toEqual({
      valid: false,
      reason: "formato",
    });

    expect(verifyWebhookSignature({ ...vector, dataId: null })).toEqual({
      valid: false,
      reason: "formato",
    });
  });

  it("rechaza un ts vencido (fuera de la ventana de 300s)", () => {
    const tsVencido = Math.floor(Date.now() / 1000) - 301;

    const result = verifyWebhookSignature(vectorValido(tsVencido));

    expect(result).toEqual({ valid: false, reason: "vencida" });
  });

  it("rechaza un ts del futuro fuera de la ventana", () => {
    const tsFuturo = Math.floor(Date.now() / 1000) + 301;

    const result = verifyWebhookSignature(vectorValido(tsFuturo));

    expect(result).toEqual({ valid: false, reason: "vencida" });
  });

  it("rechaza cuando el hash no coincide (firma forjada)", () => {
    const ts = Math.floor(Date.now() / 1000);

    const result = verifyWebhookSignature({
      signatureHeader: `ts=${ts},v1=${"0".repeat(64)}`,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ valid: false, reason: "no-coincide" });
  });

  it("rechaza sin reventar cuando v1 tiene un largo distinto al esperado", () => {
    const ts = Math.floor(Date.now() / 1000);

    const result = verifyWebhookSignature({
      signatureHeader: `ts=${ts},v1=abc123`,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
    });

    expect(result).toEqual({ valid: false, reason: "no-coincide" });
  });

  it("acepta un vector válido calculado con el mismo algoritmo", () => {
    const result = verifyWebhookSignature(vectorValido());

    expect(result).toEqual({ valid: true });
  });

  it("un ts distinto invalida la firma aunque el resto del header sea igual", () => {
    const vector = vectorValido();
    const otroTs = Math.floor(Date.now() / 1000) + 1;
    const headerConTsCambiado = vector.signatureHeader.replace(
      /ts=\d+/,
      `ts=${otroTs}`,
    );

    const result = verifyWebhookSignature({
      ...vector,
      signatureHeader: headerConTsCambiado,
    });

    expect(result).toEqual({ valid: false, reason: "no-coincide" });
  });
});
