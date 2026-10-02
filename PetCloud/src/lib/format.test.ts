import { afterEach, describe, expect, it, vi } from "vitest";

import {
  capitalize,
  formatAge,
  formatDate,
  formatLongDate,
  parseDate,
} from "@/lib/format";

afterEach(() => {
  vi.useRealTimers();
});

describe("parseDate", () => {
  /**
   * La razón de existir de esta función: `new Date("2026-08-14")` se interpreta
   * como UTC y en Buenos Aires (UTC-3) retrocede al 13. Toda la app muestra
   * fechas de vacunación y vencimientos, así que un día de corrimiento no es
   * cosmético.
   */
  it("interpreta el ISO como fecha local, no como UTC", () => {
    const fecha = parseDate("2026-08-14");

    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(7); // agosto es 7: los meses arrancan en 0
    expect(fecha.getDate()).toBe(14);
  });

  it("no retrocede un día en zonas horarias al oeste de Greenwich", () => {
    expect(parseDate("2026-01-01").getDate()).toBe(1);
    expect(parseDate("2026-12-31").getDate()).toBe(31);
  });
});

describe("formatDate", () => {
  it("abrevia el mes a tres letras", () => {
    expect(formatDate("2026-08-14")).toBe("14 ago 2026");
  });

  it("no rellena el día con cero a la izquierda", () => {
    expect(formatDate("2026-03-05")).toBe("5 mar 2026");
  });

  it("cubre el primero y el último mes", () => {
    expect(formatDate("2026-01-15")).toBe("15 ene 2026");
    expect(formatDate("2026-12-15")).toBe("15 dic 2026");
  });
});

describe("formatLongDate", () => {
  it("escribe el mes completo", () => {
    expect(formatLongDate("2026-08-14")).toBe("14 de agosto de 2026");
  });

  it("usa septiembre, no setiembre", () => {
    expect(formatLongDate("2026-09-01")).toBe("1 de septiembre de 2026");
  });
});

describe("formatAge", () => {
  it("dice solo meses cuando todavía no cumplió un año", () => {
    expect(formatAge("2026-02-11", new Date(2026, 7, 11))).toBe("6 meses");
  });

  it("usa el singular con un solo mes", () => {
    expect(formatAge("2026-07-11", new Date(2026, 7, 11))).toBe("1 mes");
  });

  it("dice solo años cuando el mes coincide", () => {
    expect(formatAge("2024-08-11", new Date(2026, 7, 11))).toBe("2 años");
  });

  it("usa el singular con un solo año", () => {
    expect(formatAge("2025-08-11", new Date(2026, 7, 11))).toBe("1 año");
  });

  it("combina años y meses", () => {
    expect(formatAge("2024-04-11", new Date(2026, 7, 11))).toBe(
      "2 años y 4 meses",
    );
  });

  it("no cuenta el mes si todavía no llegó el día", () => {
    // Nació un 20; al 11 de agosto el mes en curso no está cumplido, así que
    // el conteo baja a 0 meses y la frase se simplifica a solo los años.
    expect(formatAge("2025-07-20", new Date(2026, 7, 11))).toBe("1 año");
  });

  it("resta un año cuando el mes de cumpleaños todavía no llegó", () => {
    expect(formatAge("2024-11-11", new Date(2026, 7, 11))).toBe(
      "1 año y 9 meses",
    );
  });

  /**
   * Los mappers hacen `date_of_birth ?? ""`, así que "sin fecha de nacimiento"
   * llega acá como cadena vacía. Antes eso terminaba en "NaN años y NaN meses"
   * impreso en la ficha de la mascota.
   */
  it("devuelve vacío cuando no hay fecha", () => {
    expect(formatAge("", new Date(2026, 7, 11))).toBe("");
  });

  it("dice 'Edad desconocida' cuando la fecha no se puede parsear", () => {
    expect(formatAge("no es una fecha", new Date(2026, 7, 11))).toBe(
      "Edad desconocida",
    );
  });

  it("dice 'Edad desconocida' con una fecha futura, nunca una edad negativa", () => {
    expect(formatAge("2026-09-01", new Date(2026, 7, 11))).toBe(
      "Edad desconocida",
    );
  });

  it("toma el día de hoy en Argentina cuando no se le pasa una", () => {
    vi.useFakeTimers();
    // 02:00 UTC del 11/08 = 23:00 del 10/08 en Argentina: todavía no cumplió.
    vi.setSystemTime(new Date("2026-08-11T02:00:00Z"));
    expect(formatAge("2024-08-11")).toBe("1 año y 11 meses");

    vi.setSystemTime(new Date("2026-08-11T15:00:00Z"));

    expect(formatAge("2024-08-11")).toBe("2 años");
  });
});

describe("capitalize", () => {
  it("pone la primera en mayúscula y no toca el resto", () => {
    expect(capitalize("perro")).toBe("Perro");
    expect(capitalize("perro y gato")).toBe("Perro y gato");
  });

  it("deja igual lo que ya empieza en mayúscula", () => {
    expect(capitalize("Perro")).toBe("Perro");
  });

  it("no rompe con la cadena vacía", () => {
    expect(capitalize("")).toBe("");
  });
});
