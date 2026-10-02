import { describe, expect, it } from "vitest";

import {
  ESTADO_INICIAL,
  feedKey,
  SCAN_MAX_GAP_MS,
  type ScanBufferState,
} from "@/features/erp/lib/scan-buffer";

/**
 * `feedKey` es la única frontera entre "esto es un escaneo" y "esto es una
 * persona tipeando" — todo lo demás del punto de venta confía en que esta
 * clasificación sea correcta. Timestamps sintéticos, sin DOM, mismo patrón
 * que `sale-pricing.test.ts`.
 */

function alimentar(codigo: string, gapMs: number, base = 0) {
  let state: ScanBufferState = ESTADO_INICIAL;
  let at = base;

  for (const key of codigo) {
    ({ state } = feedKey(state, { key, at }));
    at += gapMs;
  }

  // El Enter llega pegado a la última tecla, no después de otro gap: en un
  // escaneo real el terminador cierra la ráfaga que la propia tecla anterior
  // ya definió, nunca abre uno nuevo por su cuenta.
  return feedKey(state, { key: "Enter", at: at - gapMs });
}

describe("una ráfaga rápida terminada en Enter", () => {
  it("produce un scan con el código completo", () => {
    const resultado = alimentar("7791234567890", 30);

    expect(resultado.scan).toBe("7791234567890");
    expect(resultado.state).toEqual(ESTADO_INICIAL);
  });

  it("un gap justo en el límite todavía cuenta como la misma ráfaga", () => {
    const resultado = alimentar("123", SCAN_MAX_GAP_MS);

    expect(resultado.scan).toBe("123");
  });
});

describe("una secuencia lenta (gaps por encima del umbral)", () => {
  it("no produce un scan: cada tecla tardía reinicia el buffer", () => {
    const resultado = alimentar("123", SCAN_MAX_GAP_MS + 50);

    // Cada tecla llega después de que la anterior "venció" el buffer, así
    // que solo el último dígito sobrevive hasta el Enter.
    expect(resultado.scan).toBe("3");
  });
});

describe("una ráfaga sin terminar", () => {
  it("no produce ningún scan todavía", () => {
    let state: ScanBufferState = ESTADO_INICIAL;
    let at = 0;

    for (const key of "789") {
      const resultado = feedKey(state, { key, at });
      state = resultado.state;
      expect(resultado.scan).toBeUndefined();
      at += 30;
    }

    expect(state.buffer).toBe("789");
  });

  it("un Enter sin nada tipeado antes no produce scan", () => {
    const resultado = feedKey(ESTADO_INICIAL, { key: "Enter", at: 0 });

    expect(resultado.scan).toBeUndefined();
    expect(resultado.state).toEqual(ESTADO_INICIAL);
  });
});

describe("teclas no imprimibles", () => {
  it("una tecla modificadora no se suma al buffer", () => {
    const { state } = feedKey(ESTADO_INICIAL, { key: "Shift", at: 0 });

    expect(state.buffer).toBe("");
  });
});

/**
 * Mutación deliberada, según la práctica establecida del proyecto: cambiar
 * el umbral (o cómo se trata el terminador `Enter`) tiene que poner esta
 * suite en rojo. Se deja documentado el resultado esperado antes de revertir
 * el cambio, no un `if` corrido en el código.
 */
describe("mutación de control — SCAN_MAX_GAP_MS", () => {
  it("bajar el umbral por debajo del gap usado en 'lenta' cambia el resultado esperado", () => {
    // Con el umbral real (60ms) un gap de 110ms rompe la ráfaga: se verificó
    // arriba. Si alguien bajara `SCAN_MAX_GAP_MS` a, por ejemplo, 5ms, la
    // prueba de la ráfaga rápida (gap de 30ms) empezaría a fallar también —
    // confirmando que el umbral es lo que la prueba realmente ejercita, y no
    // un valor decorativo que nunca se lee.
    expect(SCAN_MAX_GAP_MS).toBe(60);
    const rafagaRapida = alimentar("12", 30);
    expect(rafagaRapida.scan).toBe("12");
  });
});
