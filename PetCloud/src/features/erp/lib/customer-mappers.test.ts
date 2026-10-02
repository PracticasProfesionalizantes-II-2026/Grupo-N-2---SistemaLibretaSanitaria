import { describe, expect, it } from "vitest";

import {
  estaSobreLimite,
  toAccountMovement,
  toCustomer,
  toCustomerPrefill,
} from "@/features/erp/lib/customer-mappers";

describe("estaSobreLimite", () => {
  it("nunca marca cuando el límite es NULL, sea cual sea el saldo", () => {
    expect(estaSobreLimite(999_999_999, null)).toBe(false);
    expect(estaSobreLimite(-999_999_999, null)).toBe(false);
  });

  it("marca cuando el saldo supera el límite", () => {
    expect(estaSobreLimite(53_000_000, 50_000_000)).toBe(true);
  });

  it("no marca cuando el saldo es igual o menor al límite", () => {
    expect(estaSobreLimite(50_000_000, 50_000_000)).toBe(false);
    expect(estaSobreLimite(10_000_000, 50_000_000)).toBe(false);
  });

  it("un saldo negativo (a favor del cliente) nunca está sobre el límite", () => {
    expect(estaSobreLimite(-10_000, 5_000_00)).toBe(false);
  });
});

describe("toCustomer", () => {
  const base = {
    id: "c1",
    profile_id: null,
    razon_social: "Juan Pérez",
    tipo_documento: "dni" as const,
    numero_documento: "30111222",
    condicion_iva: "consumidor_final" as const,
    domicilio: "Calle Falsa 123",
    email: "juan@example.com",
    phone: "1122334455",
    credit_limit_cents: null,
    balance_cents: 0,
    active: true,
  };

  it("convierte centavos a pesos", () => {
    const cliente = toCustomer({ ...base, balance_cents: 150_050 });
    expect(cliente.saldoPesos).toBe(1_500.5);
  });

  it("un saldo negativo se convierte sin perder el signo", () => {
    const cliente = toCustomer({ ...base, balance_cents: -300_000 });
    expect(cliente.saldoPesos).toBe(-3_000);
    expect(cliente.sobreLimite).toBe(false);
  });

  it("limiteCreditoPesos es null cuando el límite es null", () => {
    const cliente = toCustomer(base);
    expect(cliente.limiteCreditoPesos).toBeNull();
  });

  it("sobreLimite se calcula con el límite convertido a centavos", () => {
    const cliente = toCustomer({
      ...base,
      balance_cents: 53_000_000,
      credit_limit_cents: 50_000_000,
    });
    expect(cliente.sobreLimite).toBe(true);
    expect(cliente.limiteCreditoPesos).toBe(500_000);
  });
});

describe("toAccountMovement", () => {
  const base = {
    id: "m1",
    customer_id: "c1",
    kind: "payment" as const,
    amount_cents: -500_000,
    note: "Pago en efectivo",
    voided_at: null,
    voids_movement_id: null,
    created_by: "prof-1",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("convierte centavos con signo a pesos", () => {
    const movimiento = toAccountMovement(base, "Ana Vet");
    expect(movimiento.montoPesos).toBe(-5_000);
    expect(movimiento.responsable).toBe("Ana Vet");
  });

  it("marca anulado y contrasiento a partir de la fila", () => {
    const movimiento = toAccountMovement(
      { ...base, voided_at: "2026-01-02T00:00:00Z", voids_movement_id: "m0" },
      "Ana Vet",
    );
    expect(movimiento.anulado).toBe(true);
    expect(movimiento.esContrasiento).toBe(true);
  });
});

describe("toCustomerPrefill", () => {
  it("arma el nombre a partir de first_name + last_name", () => {
    const prefill = toCustomerPrefill({
      first_name: "Juan",
      last_name: "Pérez",
      address: "Calle Falsa 123",
      phone: "1122334455",
    });

    expect(prefill.nombre).toBe("Juan Pérez");
    expect(prefill.domicilio).toBe("Calle Falsa 123");
    expect(prefill.telefono).toBe("1122334455");
  });

  it("nombre es null cuando no hay ni first_name ni last_name", () => {
    const prefill = toCustomerPrefill({
      first_name: null,
      last_name: null,
      address: null,
      phone: null,
    });

    expect(prefill.nombre).toBeNull();
  });
});
