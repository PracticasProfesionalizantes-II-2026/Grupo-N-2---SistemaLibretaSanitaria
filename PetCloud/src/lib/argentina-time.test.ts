import { describe, expect, it } from "vitest";

import {
  argentinaAUtcIso,
  diaSemanaArgentina,
  fechaArgentina,
  fechaHoraArgentina,
  horaArgentina,
  hoyArgentina,
  limitesDiaArgentina,
  sumarDias,
} from "@/lib/argentina-time";

// 23:30 del sábado 26/09 en Argentina: en UTC ya es domingo 27.
const NOCHE = new Date("2026-09-27T02:30:00Z");
// 00:10 del domingo 27/09 en Argentina (= 03:10Z): recién empezó el día.
const MEDIANOCHE = new Date("2026-09-27T03:10:00Z");

describe("hoyArgentina / horaArgentina", () => {
  it("23:30 en Argentina sigue siendo el mismo día aunque en UTC ya sea mañana", () => {
    expect(hoyArgentina(NOCHE)).toBe("2026-09-26");
    expect(horaArgentina(NOCHE)).toBe("23:30");
    expect(horaArgentina(NOCHE.toISOString())).toBe("23:30");
  });

  it("00:10 en Argentina ya es el día nuevo", () => {
    expect(hoyArgentina(MEDIANOCHE)).toBe("2026-09-27");
    expect(horaArgentina(MEDIANOCHE)).toBe("00:10");
  });

  it("02:00Z es todavía la noche anterior en Argentina", () => {
    expect(hoyArgentina("2026-01-01T02:00:00Z")).toBe("2025-12-31");
    expect(horaArgentina("2026-01-01T02:00:00Z")).toBe("23:00");
  });

  it("da el día de la semana argentino", () => {
    expect(diaSemanaArgentina(NOCHE)).toBe("saturday");
    expect(diaSemanaArgentina(MEDIANOCHE)).toBe("sunday");
  });
});

describe("fechaArgentina", () => {
  it("formatea un instante en dd/mm/aaaa de Argentina", () => {
    expect(fechaArgentina(NOCHE)).toBe("26/09/2026");
    expect(fechaHoraArgentina(NOCHE)).toBe("26/09/2026 23:30");
  });

  it("no corre una fecha DATE (solo día) de zona", () => {
    expect(fechaArgentina("2026-09-26")).toBe("26/09/2026");
    expect(
      fechaArgentina("2026-09-26", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    ).toBe("26 de septiembre de 2026");
  });
});

describe("argentinaAUtcIso / limitesDiaArgentina", () => {
  it("convierte fecha y hora de Argentina a UTC", () => {
    expect(argentinaAUtcIso("2026-09-26", "23:30")).toBe(
      "2026-09-27T02:30:00.000Z",
    );
    expect(argentinaAUtcIso("2026-09-27", "00:10")).toBe(
      "2026-09-27T03:10:00.000Z",
    );
  });

  it("el día argentino va de 03:00Z a 03:00Z del día siguiente", () => {
    expect(limitesDiaArgentina("2026-09-26")).toEqual({
      inicio: "2026-09-26T03:00:00.000Z",
      fin: "2026-09-27T03:00:00.000Z",
    });
  });

  it("suma días de calendario cruzando mes y año", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-09-26", 365)).toBe("2027-09-26");
  });
});
