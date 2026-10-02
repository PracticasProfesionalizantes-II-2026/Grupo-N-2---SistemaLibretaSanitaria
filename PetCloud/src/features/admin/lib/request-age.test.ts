import { describe, expect, it } from "vitest";

import {
  antiguedadSolicitud,
  horasDesde,
  superaPlazo,
} from "@/features/admin/lib/request-age";

const AHORA = new Date("2026-09-29T15:00:00Z");

describe("horasDesde", () => {
  it("cuenta horas enteras", () => {
    expect(horasDesde("2026-09-29T12:30:00Z", AHORA)).toBe(2);
  });

  it("no devuelve negativos ni NaN", () => {
    expect(horasDesde("2026-09-30T00:00:00Z", AHORA)).toBe(0);
    expect(horasDesde("no es fecha", AHORA)).toBe(0);
  });
});

describe("antiguedadSolicitud", () => {
  it.each([
    ["2026-09-29T14:30:00Z", "hace menos de una hora"],
    ["2026-09-29T14:00:00Z", "hace 1 hora"],
    ["2026-09-29T10:00:00Z", "hace 5 horas"],
    ["2026-09-28T14:00:00Z", "hace 1 día"],
    ["2026-08-16T15:00:00Z", "hace 44 días"],
  ])("%s → %s", (desde, esperado) => {
    expect(antiguedadSolicitud(desde, AHORA)).toBe(esperado);
  });
});

describe("superaPlazo", () => {
  it("marca a partir de las 48 h", () => {
    expect(superaPlazo("2026-09-27T15:00:00Z", AHORA)).toBe(true);
    expect(superaPlazo("2026-09-27T15:01:00Z", AHORA)).toBe(false);
  });
});
