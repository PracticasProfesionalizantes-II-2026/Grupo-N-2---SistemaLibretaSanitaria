import { describe, expect, it } from "vitest";

import {
  motivoSinFirma,
  puedeFirmar,
  type EstadoDeFirma,
} from "@/features/vet/lib/puede-firmar";

/**
 * Los tres estados en los que puede estar quien va a firmar, y el orden en que
 * se resuelven.
 *
 * Esto no es la frontera de seguridad —esa es la `065` y se prueba en
 * `tests/rls/vet-firmas.test.ts`—, pero sí decide qué lee la persona cuando el
 * botón está apagado. Confundir "falta la matrícula" con "falta la firma" manda
 * a alguien a Ajustes a resolver algo que no depende de ella.
 */

function estado(overrides: Partial<EstadoDeFirma> = {}): EstadoDeFirma {
  return { licenciaValidada: true, firmaId: "firma-1", ...overrides };
}

describe("motivoSinFirma", () => {
  it("no da motivo cuando hay matrícula validada y firma cargada", () => {
    expect(motivoSinFirma(estado())).toBeNull();
  });

  it("da 'sin-matricula' cuando la matrícula todavía está en validación", () => {
    expect(motivoSinFirma(estado({ licenciaValidada: false }))).toBe(
      "sin-matricula",
    );
  });

  it("da 'sin-firma' cuando la matrícula está validada pero no cargó firma", () => {
    expect(motivoSinFirma(estado({ firmaId: null }))).toBe("sin-firma");
  });

  it("prioriza la matrícula cuando faltan las dos: cargar la firma no habilitaría nada", () => {
    expect(motivoSinFirma({ licenciaValidada: false, firmaId: null })).toBe(
      "sin-matricula",
    );
  });

  it("sin sesión de profesional el motivo es el de matrícula", () => {
    expect(motivoSinFirma(null)).toBe("sin-matricula");
    expect(motivoSinFirma(undefined)).toBe("sin-matricula");
  });
});

describe("puedeFirmar", () => {
  it("es verdadero solo cuando no hay ningún motivo", () => {
    expect(puedeFirmar(estado())).toBe(true);
    expect(puedeFirmar(estado({ firmaId: null }))).toBe(false);
    expect(puedeFirmar(estado({ licenciaValidada: false }))).toBe(false);
    expect(puedeFirmar(null)).toBe(false);
  });
});
