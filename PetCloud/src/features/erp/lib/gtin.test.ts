import { describe, expect, it } from "vitest";

import { gtinKey, normalizeGtin } from "@/features/erp/lib/gtin";

/**
 * Tabla de casos GTIN, y a la vez el fixture que
 * `tests/rls/erp-catalogo.test.ts` reutiliza para la prueba de paridad
 * SQL/TS: el mismo insumo tiene que dar el mismo resultado acá y en
 * `erp.normalize_gtin`.
 */
const casos: Array<{ entrada: string; esperado: string | null; nota: string }> =
  [
    {
      entrada: "012345678905",
      esperado: "00012345678905",
      nota: "UPC-A leído como 12 dígitos",
    },
    {
      entrada: "0012345678905",
      esperado: "00012345678905",
      nota: "el mismo UPC-A leído como 13 dígitos",
    },
    {
      entrada: " 7791234567898 ",
      esperado: "07791234567898",
      nota: "14 dígitos válido, con espacios alrededor",
    },
    {
      entrada: "96385074",
      esperado: "00000096385074",
      nota: "EAN-8 válido",
    },
    {
      entrada: "012345678906",
      esperado: null,
      nota: "dígito verificador incorrecto",
    },
    {
      entrada: "12345",
      esperado: null,
      nota: "largo no estándar (5 dígitos)",
    },
    {
      entrada: "12345678901",
      esperado: null,
      nota: "largo no estándar (11 dígitos)",
    },
    {
      entrada: "ABC-123",
      esperado: null,
      nota: "código no numérico",
    },
    {
      entrada: "",
      esperado: null,
      nota: "cadena vacía",
    },
  ];

describe("normalizeGtin", () => {
  for (const { entrada, esperado, nota } of casos) {
    it(nota, () => {
      expect(normalizeGtin(entrada)).toBe(esperado);
    });
  }

  it("un UPC-A leído en 12 y en 13 dígitos normaliza al mismo GTIN-14", () => {
    expect(normalizeGtin("012345678905")).toBe(normalizeGtin("0012345678905"));
  });
});

describe("gtinKey", () => {
  it("un código GTIN válido usa su forma normalizada como clave", () => {
    expect(gtinKey("012345678905")).toBe("00012345678905");
  });

  it("un código no-GTIN usa su propio valor recortado como clave", () => {
    expect(gtinKey(" ABC-123 ")).toBe("ABC-123");
  });

  it("dos lecturas (12 y 13 dígitos) del mismo UPC-A resuelven a la misma clave", () => {
    expect(gtinKey("012345678905")).toBe(gtinKey("0012345678905"));
  });
});
