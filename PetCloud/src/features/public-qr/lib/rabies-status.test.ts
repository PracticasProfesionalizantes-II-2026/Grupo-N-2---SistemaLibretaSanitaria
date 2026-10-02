import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AYUDA_ANTIRRABICA,
  ETIQUETAS_ANTIRRABICA,
  parseEstadoAntirrabica,
  type EstadoAntirrabica,
} from "@/features/public-qr/lib/rabies-status";

const ESTADOS: EstadoAntirrabica[] = [
  "al-dia",
  "por-vencer",
  "vencida",
  "sin-datos",
];

describe("parseEstadoAntirrabica", () => {
  it("acepta los cuatro estados que la base puede devolver", () => {
    for (const estado of ESTADOS) {
      expect(parseEstadoAntirrabica(estado)).toBe(estado);
    }
  });

  /**
   * El parseo falla cerrado, y esa dirección del error es una decisión de
   * producto escrita en el proposal: mandar a alguien a una consulta que no
   * hacía falta se arregla; un "al día" inventado que lo convence de no
   * tratarse, no.
   */
  it("cae a 'sin-datos' cuando la base no contestó", () => {
    expect(parseEstadoAntirrabica(null)).toBe("sin-datos");
    expect(parseEstadoAntirrabica(undefined)).toBe("sin-datos");
    expect(parseEstadoAntirrabica("")).toBe("sin-datos");
  });

  it("cae a 'sin-datos' ante un texto que no reconoce", () => {
    // Si mañana la función SQL gana un quinto estado, la pantalla no puede
    // romperse ni inventar: muestra que no sabe.
    expect(parseEstadoAntirrabica("al-día")).toBe("sin-datos");
    expect(parseEstadoAntirrabica("AL-DIA")).toBe("sin-datos");
    expect(parseEstadoAntirrabica("revocada")).toBe("sin-datos");
  });

  it("no confunde una propiedad heredada con un estado válido", () => {
    // Por esto el lookup va con `Object.hasOwn` y no con `in`: `"toString" in
    // ETIQUETAS_ANTIRRABICA` es true por la cadena de prototipos, y el badge
    // habría intentado renderizar una función.
    expect(parseEstadoAntirrabica("toString")).toBe("sin-datos");
    expect(parseEstadoAntirrabica("constructor")).toBe("sin-datos");
    expect(parseEstadoAntirrabica("__proto__")).toBe("sin-datos");
  });
});

describe("etiquetas", () => {
  it("cada estado dice 'Antirrábica', salvo el que no puede afirmarla", () => {
    expect(ETIQUETAS_ANTIRRABICA["al-dia"].label).toBe("Antirrábica al día");
    expect(ETIQUETAS_ANTIRRABICA["por-vencer"].label).toBe(
      "Antirrábica por vencer",
    );
    expect(ETIQUETAS_ANTIRRABICA.vencida.label).toBe("Antirrábica vencida");
  });

  /**
   * El cuarto no dice "Sin datos" a secas a propósito. "Sin datos" se lee como
   * "este perro no está vacunado", que es exactamente la mentira opuesta a la
   * que sacamos en la Fase 0. Lo que el sistema sabe es más angosto: no hay una
   * dosis firmada por un veterinario.
   */
  it("el cuarto estado habla de la certificación, no de la vacuna", () => {
    expect(ETIQUETAS_ANTIRRABICA["sin-datos"].label).toBe(
      "Sin antirrábica certificada",
    );
  });

  it("'sin-datos' va en gris: no sabemos no es está mal", () => {
    expect(ETIQUETAS_ANTIRRABICA["sin-datos"].variant).toBe("neutral");
    expect(ETIQUETAS_ANTIRRABICA["al-dia"].variant).toBe("success");
    expect(ETIQUETAS_ANTIRRABICA["por-vencer"].variant).toBe("warning");
    expect(ETIQUETAS_ANTIRRABICA.vencida.variant).toBe("danger");
  });

  it("la línea de ayuda explica de dónde sale el estado", () => {
    expect(AYUDA_ANTIRRABICA).toMatch(/veterinari/i);
  });
});

/**
 * Las dos guardas del desacople, y por qué son estas y no un type test.
 *
 * La spec exige que el estado público NO sea `HealthStatus`: un valor agregado
 * mañana al panel del dueño no puede llegar gratis a un escaneo anónimo.
 *
 * Un test de tipos no puede verificarlo. Hoy las dos uniones tienen exactamente
 * los mismos cuatro valores, así que son estructuralmente idénticas y ninguna
 * aserción estructural distingue un alias de un duplicado. Peor: `vitest
 * --typecheck` no está configurado (`package.json` corre `vitest run src`), así
 * que un `expectTypeOf` sería un no-op que pasa en silencio para siempre.
 */
describe("el estado público es su propio tipo", () => {
  it("el código del módulo no toca HealthStatus ni el tipo del panel privado", () => {
    // Falla HOY si alguien escribe `export type EstadoAntirrabica = HealthStatus`
    // o importa el tipo del panel privado para derivarlo.
    //
    // Se miran los comentarios aparte del código a propósito. El módulo explica
    // en su cabecera POR QUÉ no usa `HealthStatus`, y esa explicación es lo que
    // evita que alguien "simplifique" el duplicado; un guard que la prohibiera
    // obligaría a borrar la única defensa que sobrevive a este test.
    const fuente = readFileSync(
      join(process.cwd(), "src/features/public-qr/lib/rabies-status.ts"),
      "utf8",
    );

    const codigo = fuente
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(codigo).not.toContain("HealthStatus");
    expect(codigo).not.toContain("@/types/pet");
  });

  it("las etiquetas cubren exactamente los cuatro estados, ni uno más", () => {
    // La red para el futuro: como el Record es exhaustivo, un quinto valor en
    // `HealthStatus` más un alias rompe `npm run typecheck`, y taparlo
    // agregando una quinta etiqueta rompe esta aserción.
    expect(Object.keys(ETIQUETAS_ANTIRRABICA).sort()).toEqual(
      [...ESTADOS].sort(),
    );
  });
});
