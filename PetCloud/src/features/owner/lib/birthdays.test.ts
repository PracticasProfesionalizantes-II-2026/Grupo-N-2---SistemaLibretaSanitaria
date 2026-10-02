import { describe, expect, it } from "vitest";

import {
  mascotasQueCumplenHoy,
  tituloDeCumpleanos,
} from "@/features/owner/lib/birthdays";

const pet = (nombre: string, fechaNacimiento: string) => ({
  nombre,
  fechaNacimiento,
});

describe("mascotasQueCumplenHoy", () => {
  it("matches day and month, ignoring the year", () => {
    const now = new Date("2026-05-10T15:00:00Z");
    const result = mascotasQueCumplenHoy(
      [pet("Firulais", "2020-05-10"), pet("Michi", "2020-05-11")],
      now,
    );
    expect(result.map((p) => p.nombre)).toEqual(["Firulais"]);
  });

  it("uses the Argentine date, not UTC", () => {
    // 01:30 UTC on May 11 is still 22:30 on May 10 in Buenos Aires.
    const now = new Date("2026-05-11T01:30:00Z");
    const result = mascotasQueCumplenHoy(
      [pet("Firulais", "2020-05-10"), pet("Michi", "2020-05-11")],
      now,
    );
    expect(result.map((p) => p.nombre)).toEqual(["Firulais"]);
  });

  it("skips pets without a birth date", () => {
    const now = new Date("2026-05-10T15:00:00Z");
    expect(mascotasQueCumplenHoy([pet("Sin dato", "")], now)).toEqual([]);
  });

  it("celebrates February 29 on February 28 in non-leap years", () => {
    const pets = [pet("Bisiesto", "2020-02-29")];
    expect(
      mascotasQueCumplenHoy(pets, new Date("2027-02-28T15:00:00Z")),
    ).toHaveLength(1);
    expect(
      mascotasQueCumplenHoy(pets, new Date("2028-02-28T15:00:00Z")),
    ).toHaveLength(0);
    expect(
      mascotasQueCumplenHoy(pets, new Date("2028-02-29T15:00:00Z")),
    ).toHaveLength(1);
  });
});

describe("several pets on the same day", () => {
  it("returns every pet that has its birthday today", () => {
    const now = new Date("2026-05-10T15:00:00Z");
    const result = mascotasQueCumplenHoy(
      [
        pet("Firulais", "2019-05-10"),
        pet("Michi", "2021-05-10"),
        pet("Toby", "2022-05-10"),
        pet("Otro día", "2022-05-09"),
      ],
      now,
    );
    expect(result.map((p) => p.nombre)).toEqual(["Firulais", "Michi", "Toby"]);
  });
});

describe("tituloDeCumpleanos", () => {
  it("returns an empty string when there are no pets", () => {
    expect(tituloDeCumpleanos([])).toBe("");
  });

  it("uses the singular for one pet", () => {
    expect(tituloDeCumpleanos(["Firulais"])).toBe(
      "¡Hoy es el cumpleaños de Firulais! 🎂🎉",
    );
  });

  it("joins two names with 'y'", () => {
    expect(tituloDeCumpleanos(["Firulais", "Michi"])).toBe(
      "¡Hoy cumplen años Firulais y Michi! 🎂🎉",
    );
  });

  it("joins three or more names with commas and a final 'y'", () => {
    expect(tituloDeCumpleanos(["Firulais", "Michi", "Toby"])).toBe(
      "¡Hoy cumplen años Firulais, Michi y Toby! 🎂🎉",
    );
  });
});
