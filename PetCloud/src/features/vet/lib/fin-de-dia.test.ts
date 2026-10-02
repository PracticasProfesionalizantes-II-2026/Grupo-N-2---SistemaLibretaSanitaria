import { describe, expect, it } from "vitest";

import { finDeDiaLocal } from "@/features/vet/lib/fin-de-dia";

describe("finDeDiaLocal", () => {
  it("devuelve las 23:59:59.999 con el offset fijo de Argentina", () => {
    const fecha = new Date("2026-03-15T10:00:00.000Z");

    expect(finDeDiaLocal(fecha)).toBe("2026-03-15T23:59:59.999-03:00");
  });

  it("usa el día calendario de Buenos Aires, no el día UTC", () => {
    // 2026-03-15T23:30 UTC es todavía 2026-03-15T20:30 en Buenos Aires
    // (offset fijo -03:00): el día calendario local no cambió todavía.
    const fecha = new Date("2026-03-15T23:30:00.000Z");

    expect(finDeDiaLocal(fecha)).toBe("2026-03-15T23:59:59.999-03:00");
  });

  it("un instante que ya cruzó medianoche en Buenos Aires usa el día siguiente", () => {
    // 2026-03-16T02:00 UTC es 2026-03-15T23:00 en Buenos Aires: todavía el 15.
    // 2026-03-16T03:30 UTC es 2026-03-16T00:30 en Buenos Aires: ya el 16.
    const fecha = new Date("2026-03-16T03:30:00.000Z");

    expect(finDeDiaLocal(fecha)).toBe("2026-03-16T23:59:59.999-03:00");
  });

  it("sin argumento, usa la fecha actual", () => {
    const resultado = finDeDiaLocal();

    expect(resultado).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59\.999-03:00$/);
  });
});
