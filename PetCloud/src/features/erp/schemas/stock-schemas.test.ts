import { describe, expect, it } from "vitest";

import {
  precioDebajoDelCosto,
  productSchema,
} from "@/features/erp/schemas/stock-schemas";

const base = {
  nombre: "Antiparasitario",
  unidad: "unidad" as const,
  costo: 100,
  precio: 150,
  stockMinimo: 0,
};

describe("productSchema", () => {
  it("acepta un precio menor que el costo (la confirmación es del modal)", () => {
    const resultado = productSchema.safeParse({ ...base, precio: 80 });

    expect(resultado.success).toBe(true);
  });

  it("rechaza costo y precio vacíos en vez de tomarlos como cero", () => {
    // Un <input type="number"> vacío con `valueAsNumber` llega como NaN.
    const resultado = productSchema.safeParse({
      ...base,
      costo: Number.NaN,
      precio: Number.NaN,
    });

    expect(resultado.success).toBe(false);
    const campos = resultado.error?.issues.map((issue) => issue.path[0]);
    expect(campos).toEqual(expect.arrayContaining(["costo", "precio"]));
  });

  it("rechaza un string vacío sin coercionarlo a cero", () => {
    const resultado = productSchema.safeParse({ ...base, costo: "" });

    expect(resultado.success).toBe(false);
  });

  it("rechaza montos negativos", () => {
    expect(productSchema.safeParse({ ...base, costo: -1 }).success).toBe(false);
  });

  it("acepta cero cuando se escribe a propósito", () => {
    expect(
      productSchema.safeParse({ ...base, costo: 0, precio: 0 }).success,
    ).toBe(true);
  });
});

describe("precioDebajoDelCosto", () => {
  it("avisa solo cuando el precio es estrictamente menor", () => {
    expect(precioDebajoDelCosto({ costo: 100, precio: 99.99 })).toBe(true);
    expect(precioDebajoDelCosto({ costo: 100, precio: 100 })).toBe(false);
    expect(precioDebajoDelCosto({ costo: 100, precio: 120 })).toBe(false);
  });
});
