import { describe, expect, it } from "vitest";

import {
  LARGO_MINIMO,
  largoDeTrazo,
  largoTotal,
  tintaSuficiente,
  type Trazo,
} from "@/features/vet/lib/firma-trazos";

/**
 * Lo que se prueba acá es la única regla del lienzo que puede estar mal sin que
 * se note mirando la pantalla: cuándo lo dibujado alcanza para ser una firma.
 *
 * El dibujo en sí —que el dedo pinte, que el trazo no se corte al salirse del
 * borde— no se puede probar sin un navegador de verdad y queda en la checklist
 * manual del PR. Esto sí se puede, y es lo que decide si alguien firma
 * documentos clínicos con el lienzo casi vacío.
 */

/** Una línea recta horizontal de `largo` píxeles, en dos puntos. */
function linea(largo: number): Trazo {
  return [
    { x: 0, y: 0 },
    { x: largo, y: 0 },
  ];
}

describe("largoDeTrazo", () => {
  it("es cero para un trazo vacío o de un solo punto", () => {
    expect(largoDeTrazo([])).toBe(0);
    expect(largoDeTrazo([{ x: 10, y: 10 }])).toBe(0);
  });

  it("suma segmento a segmento, no la distancia entre extremos", () => {
    // Ida y vuelta: los extremos coinciden, pero se recorrieron 20 píxeles.
    const idaYVuelta: Trazo = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ];

    expect(largoDeTrazo(idaYVuelta)).toBe(20);
  });

  it("mide la diagonal con la distancia real", () => {
    expect(
      largoDeTrazo([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toBe(5);
  });
});

describe("largoTotal", () => {
  it("acumula todos los trazos", () => {
    expect(largoTotal([linea(30), linea(40)])).toBe(70);
  });
});

describe("tintaSuficiente", () => {
  it("rechaza el lienzo vacío", () => {
    expect(tintaSuficiente([])).toBe(false);
  });

  it("rechaza un toque suelto: un punto no es una firma", () => {
    expect(tintaSuficiente([[{ x: 100, y: 100 }]])).toBe(false);
  });

  it("rechaza un garabato más corto que el mínimo", () => {
    expect(tintaSuficiente([linea(LARGO_MINIMO - 1)])).toBe(false);
  });

  it("acepta justo en el umbral", () => {
    expect(tintaSuficiente([linea(LARGO_MINIMO)])).toBe(true);
  });

  it("acepta una firma repartida en varios trazos que solos no alcanzarían", () => {
    // Levantar el dedo entre letras es lo normal al firmar: la suma es lo que
    // cuenta, no el trazo más largo.
    const trazos = [linea(60), linea(60), linea(60)];

    expect(trazos.every((trazo) => largoDeTrazo(trazo) < LARGO_MINIMO)).toBe(
      true,
    );
    expect(tintaSuficiente(trazos)).toBe(true);
  });
});
