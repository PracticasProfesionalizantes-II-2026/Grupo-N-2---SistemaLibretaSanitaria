import { describe, expect, it } from "vitest";

import {
  toCashAccount,
  toCashMovement,
  type CashMovementCardRow,
} from "@/features/erp/lib/cash-mappers";

describe("toCashAccount", () => {
  it("convierte centavos a pesos", () => {
    expect(toCashAccount({ id: "c1", balance_cents: 123_456 }).saldoPesos).toBe(
      1234.56,
    );
  });

  it("un saldo cero da cero pesos, no null", () => {
    expect(toCashAccount({ id: "c1", balance_cents: 0 }).saldoPesos).toBe(0);
  });
});

const MOVIMIENTO_BASE: CashMovementCardRow = {
  id: "m1",
  kind: "caja_chica",
  amount_cents: -50_000,
  quantity: null,
  note: "Compra de café",
  voided_at: null,
  voids_movement_id: null,
  created_by: "prof1",
  created_at: "2026-09-01T12:00:00Z",
};

describe("toCashMovement", () => {
  it("convierte el monto con signo a pesos", () => {
    const movimiento = toCashMovement(MOVIMIENTO_BASE, "Ana Pérez");

    expect(movimiento.montoPesos).toBe(-500);
    expect(movimiento.responsable).toBe("Ana Pérez");
    expect(movimiento.diferenciaPesos).toBeNull();
  });

  it("no confunde vigente, anulado y contrasiento", () => {
    const vigente = toCashMovement(MOVIMIENTO_BASE, "X");
    expect(vigente.anulado).toBe(false);
    expect(vigente.esContrasiento).toBe(false);

    const anulado = toCashMovement(
      { ...MOVIMIENTO_BASE, voided_at: "2026-09-02T00:00:00Z" },
      "X",
    );
    expect(anulado.anulado).toBe(true);

    const contrasiento = toCashMovement(
      { ...MOVIMIENTO_BASE, voids_movement_id: "m0" },
      "X",
    );
    expect(contrasiento.esContrasiento).toBe(true);
  });

  it("expone la diferencia del arqueo en pesos, y solo para ese tipo", () => {
    const arqueo = toCashMovement(
      {
        ...MOVIMIENTO_BASE,
        kind: "arqueo",
        amount_cents: -20_000,
        quantity: -20_000,
      },
      "X",
    );

    expect(arqueo.diferenciaPesos).toBe(-200);
  });

  it("convierte el NUMERIC que PostgREST manda como string", () => {
    const arqueo = toCashMovement(
      {
        ...MOVIMIENTO_BASE,
        kind: "arqueo",
        amount_cents: 10_000,
        quantity: "10000" as unknown as number,
      },
      "X",
    );

    expect(arqueo.diferenciaPesos).toBe(100);
  });
});
