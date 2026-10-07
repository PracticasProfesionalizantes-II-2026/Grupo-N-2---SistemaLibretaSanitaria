import { describe, expect, it } from "vitest";

import { formatARS, pesosToCents } from "@/lib/money";

describe("formatARS", () => {
  it("formatea centavos como pesos argentinos con dos decimales", () => {
    expect(formatARS(150000)).toBe("$ 1.500,00");
  });

  it("redondea al centavo cuando el valor no es un entero exacto", () => {
    expect(formatARS(1999)).toBe("$ 19,99");
  });

  it("formatea cero", () => {
    expect(formatARS(0)).toBe("$ 0,00");
  });
});

describe("pesosToCents", () => {
  it("convierte pesos enteros a centavos", () => {
    expect(pesosToCents(1500)).toBe(150000);
  });

  it("no arrastra el drift de punto flotante de los decimales", () => {
    expect(pesosToCents(19.99)).toBe(1999);
  });
});
