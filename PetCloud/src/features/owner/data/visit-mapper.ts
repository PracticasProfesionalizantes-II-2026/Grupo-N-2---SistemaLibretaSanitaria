import { sql } from "drizzle-orm";

import type { Database } from "@/types/supabase";
import type { Visit, VisitStatus } from "@/types/visit";

/**
 * Traducción entre `visits` (la cola de la sala de espera, migración 008) y
 * el `Visit` que ve el dueño. Antes `listMyVisits`/`getVisits` leían
 * `medical_records`, que solo existe cuando el veterinario cierra una
 * consulta formal — una visita en curso o retirada nunca aparecía. Ahora
 * ambas leen `visits`, que es la fuente real de la cola.
 *
 * Vive acá y no en `features/owner/lib/mappers.ts` porque necesita el tipo de
 * fila con los dos embeds (`vet_institutions`, `medical_records`), que solo
 * estas dos consultas piden.
 */

type VisitStatusRow = Database["public"]["Enums"]["visit_status"];

/**
 * `waiting`/`in_progress` son estados en curso, `completed` es la única
 * atención real, y `cancelled`/`no_show` son las dos formas de "se fue sin
 * ser atendida" — la 008 no distingue entre "se cansó de esperar" y "no
 * llegó a entrar", y el dueño ve ambas como "retirada" porque el resultado es
 * el mismo: no hubo atención.
 */
const ESTADO_VISITA: Record<VisitStatusRow, VisitStatus> = {
  waiting: "en-espera",
  in_progress: "en-atencion",
  completed: "atendida",
  cancelled: "retirada",
  no_show: "retirada",
};

/**
 * El enum de la base es cerrado (`visit_status` de la 008), así que un valor
 * fuera de `ESTADO_VISITA` solo puede pasar si alguien agrega un estado nuevo
 * y se olvida de este mapa. "en-espera" es la opción más conservadora: no
 * asume que ya se atendió ni que se fue, y es el valor con el que arranca
 * toda visita nueva.
 */
function visitEstado(status: VisitStatusRow): VisitStatus {
  return ESTADO_VISITA[status] ?? "en-espera";
}

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/**
 * `checked_in_at`/`completed_at` llegan como TIMESTAMPTZ en UTC. Recortar el
 * string (`.slice(11, 16)`) daba la hora en UTC: una llegada a las 22:00 en
 * Argentina se veía como las 01:00, y del día siguiente. Se convierte igual
 * que `fechaYHoraLocal` en `appointment-queries.ts`.
 */
function hora(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** "en-CA" da "YYYY-MM-DD" directo, sin reordenar partes. */
function fecha(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(
    new Date(iso),
  );
}

/** La fila que devuelve el `select` compartido de `listMyVisits`/`getVisits`. */
export type VisitRow = Database["public"]["Tables"]["visits"]["Row"] & {
  vet_institutions: { name: string } | null;
  medical_records: { observations: string | null } | null;
};

/**
 * Selección compartida: la cola de la sala de espera (`visits v`), con el
 * nombre de la institución y las observaciones de la consulta formal cuando
 * la hubo. Se completa con `where`/`order by` sobre el alias `v`.
 */
export const VISIT_SELECT = sql`select v.*,
  (select json_build_object('name', i.name) from vet_institutions i
    where i.id = v.institution_id) as vet_institutions,
  (select json_build_object('observations', m.observations) from medical_records m
    where m.id = v.medical_record_id) as medical_records
  from visits v`;

export function toVisit(row: VisitRow): Visit {
  return {
    id: row.id,
    petId: row.pet_id,
    veterinaria: row.vet_institutions?.name ?? "",
    fecha: fecha(row.checked_in_at),
    horaLlegada: hora(row.checked_in_at) ?? "",
    horaSalida: hora(row.completed_at),
    motivo: row.reason ?? "Consulta",
    prioridad: row.is_urgent ? "urgencia" : "normal",
    estado: visitEstado(row.status),
    // `checked_in_by_id` es quien la registró en el mostrador, no
    // necesariamente quien la atendió, pero es la única persona que la fila
    // conoce y es equivalente a lo que las consultas anteriores exponían
    // (ninguna llenaba `profesionalId`).
    profesionalId: row.checked_in_by_id ?? undefined,
    // `summary` es el resumen de mostrador (012) y existe aunque no haya
    // consulta formal; las observaciones de `medical_records` solo cubren el
    // caso en que el mostrador no escribió nada.
    resumen:
      row.summary?.trim() || row.medical_records?.observations || undefined,
  };
}
