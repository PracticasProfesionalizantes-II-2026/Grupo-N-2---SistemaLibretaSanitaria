import { describe, expect, it } from "vitest";

import { TODAY_ISO } from "@/lib/today";
import { parseDate } from "@/lib/format";

/**
 * TODAY_ISO está en el camino de todos los cálculos de vencimiento del demo.
 * No se prueba su valor —va a cambiar— sino su forma: si deja de ser una fecha
 * parseable, los vencimientos fallan en silencio en vez de romper acá.
 */
describe("TODAY_ISO", () => {
  it("tiene formato ISO de fecha", () => {
    expect(TODAY_ISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("es una fecha real, no un 31 de febrero", () => {
    const fecha = parseDate(TODAY_ISO);
    const [year, month, day] = TODAY_ISO.split("-").map(Number);

    expect(fecha.getFullYear()).toBe(year);
    expect(fecha.getMonth()).toBe(month - 1);
    expect(fecha.getDate()).toBe(day);
  });
});
