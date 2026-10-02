import { describe, expect, it } from "vitest";

import {
  DAYS_OF_WEEK,
  absenceStatusSchema,
  onCallScheduleSchema,
  scheduleSchema,
} from "@/features/vet/schemas/schedule-schemas";

const semana = Object.fromEntries(
  DAYS_OF_WEEK.map((dia) => [
    dia,
    dia === "sunday"
      ? { open: false }
      : { open: true, from: "09:00", to: "18:00" },
  ]),
);

describe("scheduleSchema", () => {
  it("acepta `{}`: todavía no cargó horarios", () => {
    expect(scheduleSchema.safeParse({}).success).toBe(true);
  });

  it("acepta los siete días", () => {
    expect(scheduleSchema.safeParse(semana).success).toBe(true);
  });

  it("rechaza una semana a medias", () => {
    const sinDomingo = Object.fromEntries(
      Object.entries(semana).filter(([dia]) => dia !== "sunday"),
    );
    expect(scheduleSchema.safeParse(sinDomingo).success).toBe(false);
  });

  it("rechaza un día que no existe", () => {
    expect(
      scheduleSchema.safeParse({ ...semana, lun: { open: false } }).success,
    ).toBe(false);
  });

  it("rechaza horas fuera de formato", () => {
    expect(
      scheduleSchema.safeParse({
        ...semana,
        monday: { open: true, from: "9:00", to: "18:00" },
      }).success,
    ).toBe(false);
    expect(
      scheduleSchema.safeParse({
        ...semana,
        monday: { open: true, from: "09:00", to: "24:00" },
      }).success,
    ).toBe(false);
  });

  it("rechaza un cierre que no es posterior a la apertura", () => {
    expect(
      scheduleSchema.safeParse({
        ...semana,
        monday: { open: true, from: "18:00", to: "09:00" },
      }).success,
    ).toBe(false);
    expect(
      scheduleSchema.safeParse({
        ...semana,
        monday: { open: true, from: "09:00", to: "09:00" },
      }).success,
    ).toBe(false);
  });

  it("rechaza un día abierto sin horas y uno cerrado con horas", () => {
    expect(
      scheduleSchema.safeParse({ ...semana, monday: { open: true } }).success,
    ).toBe(false);
    expect(
      scheduleSchema.safeParse({
        ...semana,
        sunday: { open: false, from: "09:00", to: "18:00" },
      }).success,
    ).toBe(false);
  });

  it("rechaza `open` que no es booleano", () => {
    expect(
      scheduleSchema.safeParse({ ...semana, sunday: { open: "no" } }).success,
    ).toBe(false);
  });
});

describe("onCallScheduleSchema", () => {
  it("acepta vacío y días válidos", () => {
    expect(onCallScheduleSchema.safeParse([]).success).toBe(true);
    expect(onCallScheduleSchema.safeParse(["saturday", "sunday"]).success).toBe(
      true,
    );
  });

  it("rechaza días repetidos o inventados", () => {
    expect(
      onCallScheduleSchema.safeParse(["saturday", "saturday"]).success,
    ).toBe(false);
    expect(onCallScheduleSchema.safeParse(["sab"]).success).toBe(false);
  });
});

describe("absenceStatusSchema", () => {
  it("acepta los tres estados y nada más", () => {
    for (const estado of ["available", "unavailable", "vacation"]) {
      expect(absenceStatusSchema.safeParse(estado).success).toBe(true);
    }
    expect(absenceStatusSchema.safeParse("enfermo").success).toBe(false);
  });
});
