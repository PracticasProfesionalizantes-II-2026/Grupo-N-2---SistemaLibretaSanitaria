import { z } from "zod";

import { diaSemanaArgentina } from "@/lib/argentina-time";

/**
 * Horarios de atención y días de guardia programada de una institución.
 *
 * Es la misma forma que hacen cumplir los CHECK de la base
 * (`068_vet_institution_schedule.sql` y `070_vet_on_call_names_and_schedule.sql`):
 * este schema es la primera barrera y la que da el mensaje; la base es la que
 * no deja pasar nada si alguien se saltea la acción.
 */

export const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

/** En plural, para frases como "Hace guardia los sábados". */
export const DAY_LABELS_PLURAL: Record<DayOfWeek, string> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miércoles",
  thursday: "jueves",
  friday: "viernes",
  saturday: "sábados",
  sunday: "domingos",
};

export const dayOfWeekSchema = z.enum(DAYS_OF_WEEK);

/** `HH:MM` de 24 horas, el mismo patrón que el CHECK de la 068. */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const horaSchema = z.string().regex(HORA, "Usá el formato HH:MM");

export const dayScheduleSchema = z.discriminatedUnion("open", [
  z
    .object({ open: z.literal(true), from: horaSchema, to: horaSchema })
    .strict()
    // `HH:MM` con ceros a la izquierda ordena igual como texto que como hora.
    .refine((dia) => dia.from < dia.to, {
      message: "La hora de cierre tiene que ser posterior a la de apertura",
      path: ["to"],
    }),
  z.object({ open: z.literal(false) }).strict(),
]);

type DaySchedule = z.infer<typeof dayScheduleSchema>;

/**
 * Los siete días, o ninguno.
 *
 * `{}` significa "todavía no cargó horarios" y es el valor con el que nace
 * toda institución. Un objeto a medias no significa nada claro — ¿el día que
 * falta está cerrado o no se cargó? — así que no se acepta.
 */
export const scheduleSchema = z.union([
  z.object({}).strict(),
  z
    .object(
      Object.fromEntries(
        DAYS_OF_WEEK.map((dia) => [dia, dayScheduleSchema]),
      ) as Record<DayOfWeek, typeof dayScheduleSchema>,
    )
    .strict(),
]);

export type FullSchedule = Record<DayOfWeek, DaySchedule>;
export type Schedule = FullSchedule | Record<string, never>;

/** Días de guardia programada: sin repetidos, solo días válidos. */
export const onCallScheduleSchema = z
  .array(dayOfWeekSchema)
  .refine((dias) => new Set(dias).size === dias.length, {
    message: "Hay días repetidos",
  });

/**
 * El día de la semana en Buenos Aires, sin depender de la zona horaria del
 * servidor ni del navegador: `Intl` con `timeZone` explícita devuelve el
 * nombre del día en esa zona, y `en-US` garantiza que sea `Monday`…`Sunday`.
 */
export function todayInBuenosAires(ahora: Date = new Date()): DayOfWeek {
  return diaSemanaArgentina(ahora) as DayOfWeek;
}

/** Disponibilidad propia del profesional (071). */
export const ABSENCE_STATUSES = [
  "available",
  "unavailable",
  "vacation",
] as const;

export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];

export const absenceStatusSchema = z.enum(ABSENCE_STATUSES);

export const ABSENCE_LABELS: Record<AbsenceStatus, string> = {
  available: "Disponible",
  unavailable: "No estoy",
  vacation: "De vacaciones",
};
