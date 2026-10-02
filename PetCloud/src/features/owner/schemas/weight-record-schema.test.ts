import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ERROR_FECHA_FUTURA,
  ERROR_FECHA_REQUERIDA,
  errorFechaAnteriorAlNacimiento,
  hoyISO,
  pesajeDelMismoDia,
  validarFechaDePeso,
} from "./weight-record-schema";

/**
 * Todas las pruebas fijan `hoy` a mano. Sin eso, la suite empieza a fallar sola
 * el día que el calendario alcance a las constantes del archivo.
 */
const HOY = "2026-09-17";
const NACIMIENTO = "2024-03-05";

describe("validarFechaDePeso", () => {
  it("acepta una fecha entre el nacimiento y hoy", () => {
    expect(validarFechaDePeso("2025-06-01", NACIMIENTO, HOY)).toBeNull();
  });

  it("acepta la fecha de hoy", () => {
    expect(validarFechaDePeso(HOY, NACIMIENTO, HOY)).toBeNull();
  });

  it("acepta el mismo día del nacimiento", () => {
    expect(validarFechaDePeso(NACIMIENTO, NACIMIENTO, HOY)).toBeNull();
  });

  it("rechaza una fecha futura", () => {
    expect(validarFechaDePeso("2026-09-18", NACIMIENTO, HOY)).toBe(
      ERROR_FECHA_FUTURA,
    );
  });

  it("rechaza una fecha anterior al nacimiento", () => {
    expect(validarFechaDePeso("2024-03-04", NACIMIENTO, HOY)).toBe(
      errorFechaAnteriorAlNacimiento(NACIMIENTO),
    );
  });

  it("la fecha futura gana sobre el piso: el mensaje habla de hoy", () => {
    // Una fecha que viola las dos reglas a la vez no existe, pero el orden de
    // las comprobaciones sí se puede leer al revés por accidente.
    expect(validarFechaDePeso("2030-01-01", NACIMIENTO, HOY)).toBe(
      ERROR_FECHA_FUTURA,
    );
  });

  it("sin fecha de nacimiento no valida el piso", () => {
    // `mappers.ts` proyecta la columna NULL como string vacío; las actions leen
    // `null` directo de la base. Los dos significan lo mismo acá.
    expect(validarFechaDePeso("1990-01-01", "", HOY)).toBeNull();
    expect(validarFechaDePeso("1990-01-01", null, HOY)).toBeNull();
    expect(validarFechaDePeso("1990-01-01", undefined, HOY)).toBeNull();
  });

  it("sin fecha de nacimiento sigue rechazando el futuro", () => {
    expect(validarFechaDePeso("2026-09-18", "", HOY)).toBe(ERROR_FECHA_FUTURA);
  });

  it("rechaza la fecha vacía", () => {
    expect(validarFechaDePeso("", NACIMIENTO, HOY)).toBe(ERROR_FECHA_REQUERIDA);
  });
});

describe("hoyISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve el día argentino, no el de UTC", () => {
    // El bug que este formato evita: `new Date().toISOString()` a las 22:00 en
    // Argentina (UTC-3) ya devuelve el día siguiente. El reloj va fijo: con la
    // hora real, el resultado esperado dependía de la zona de la máquina y el
    // test fallaba en CI (UTC) entre las 21 y las 24 h de Argentina.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T01:30:00Z")); // 29/09 22:30 ART

    expect(hoyISO()).toBe("2026-09-29");
  });
});

describe("pesajeDelMismoDia", () => {
  const pesajes = [
    { id: "a", fecha: "2026-09-28", origen: "dueno" as const, pesoKg: 10 },
    {
      id: "b",
      fecha: "2026-09-29",
      origen: "veterinario" as const,
      pesoKg: 11,
    },
    { id: "c", fecha: "2026-09-29", origen: "dueno" as const, pesoKg: 12 },
  ];

  it("prefiere el del dueño de ese día", () => {
    expect(pesajeDelMismoDia(pesajes, "2026-09-29")?.id).toBe("c");
  });

  it("devuelve el del veterinario si es el único", () => {
    expect(pesajeDelMismoDia(pesajes.slice(0, 2), "2026-09-29")?.id).toBe("b");
  });

  it("sin pesaje ese día, nada", () => {
    expect(pesajeDelMismoDia(pesajes, "2026-09-27")).toBeUndefined();
  });
});
