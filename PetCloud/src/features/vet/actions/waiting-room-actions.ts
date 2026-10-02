"use server";

import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  getPetAppointmentsForDay,
  type AppointmentListItem,
} from "@/features/vet/data/appointments";
import {
  ordenarCola,
  toVisit,
  type VisitRow,
} from "@/features/vet/lib/mappers";
import { requireVet } from "@/features/vet/lib/vet-session";
import { getDb, insertInto, query, rpc, withUser } from "@/lib/db";
import { VISIT_SELECT } from "@/features/vet/lib/vet-sql";
import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import type { Database } from "@/types/supabase";
import { hoyArgentina, limitesDiaArgentina } from "@/lib/argentina-time";

type VisitInsert = Database["public"]["Tables"]["visits"]["Insert"];

/**
 * Sala de espera: la cola por orden de llegada.
 *
 * No es una agenda. La veterinaria atiende a quien llega, y lo que el sistema
 * registra son los dos momentos que producen historia: cuándo entró la mascota
 * y qué se le hizo. Las urgencias entran a la misma cola pero marcadas — saltar
 * la fila queda explícito y auditable en vez de ser una decisión invisible del
 * mostrador.
 */

const GENERIC_ERROR =
  "No pudimos actualizar la sala de espera. Probá de nuevo.";

/** Corre la escritura como el veterinario; `false` si falló o no tocó nada. */
async function escribir(userId: string, sentencia: SQL): Promise<boolean> {
  try {
    const filas = await withUser(userId, (tx) =>
      query(tx, sql`${sentencia} returning 1`),
    );
    return filas.length > 0;
  } catch (error) {
    console.error("waiting-room", error);
    return false;
  }
}

export async function checkIn(
  petId: string,
  {
    motivo,
    urgente,
    appointmentId,
  }: { motivo?: string; urgente?: boolean; appointmentId?: string } = {},
): Promise<ActionResult<{ visitId: string }>> {
  const vet = await requireVet();
  // `owner_id` no se manda: lo completa el trigger `visits_set_owner` leyéndolo
  // de la mascota. Es lo que hace que el dueño vea su propia visita, y no puede
  // depender de lo que se escriba en el mostrador.
  //
  // El tipo generado igual lo exige, porque la columna es NOT NULL y un tipo de
  // TypeScript no sabe que hay un trigger BEFORE INSERT completándola. De ahí el
  // cast: es la única forma de decir "esto lo resuelve la base" sin mandar un
  // valor inventado. Antes se mandaba el id del veterinario y solo funcionaba
  // porque el trigger lo tapaba — el día que ese trigger cambie, las visitas
  // habrían quedado atribuidas a quien las registró en vez de a su dueño.
  const fila: Omit<VisitInsert, "owner_id"> = {
    pet_id: petId,
    institution_id: vet.institucionId,
    checked_in_by_id: vet.profesionalId,
    reason: motivo?.trim() || null,
    is_urgent: urgente ?? false,
    status: "waiting",
    // El turno del que viene la llegada, si viene de uno (migración 059). No se
    // valida acá: la FK compuesta exige que sea de esta institución y el
    // trigger `visits_appointment_matches_pet_check` que sea de esta mascota.
    // Un `appointmentId` inventado hace fallar el INSERT, no lo deja entrar.
    appointment_id: appointmentId ?? null,
  };

  let data: { id: string } | undefined;
  try {
    [data] = await withUser(vet.usuario.id, (tx) =>
      query<{ id: string }>(
        tx,
        sql`${insertInto("visits", fila)} returning id`,
      ),
    );
  } catch (error) {
    console.error("checkIn", error);
  }

  if (!data) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/sala-de-espera");
  revalidatePath("/veterinaria/gestion");

  return { success: true, visitId: data.id };
}

export async function startAttending(visitId: string): Promise<ActionResult> {
  const vet = await requireVet();
  const ok = await escribir(
    vet.usuario.id,
    sql`update visits set status = 'in_progress'
         where id = ${visitId} and institution_id = ${vet.institucionId}`,
  );

  if (!ok) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/sala-de-espera");
  return { success: true };
}

/**
 * Cierra la atención y la ata a su registro clínico.
 *
 * El vínculo con `medical_record_id` es lo que convierte una fila de la cola en
 * historia: sin él, la visita solo dice que la mascota estuvo, no qué le
 * hicieron.
 *
 * `resumen` es la nota de mostrador de la 012, para el cierre rápido que no
 * pasa por la consulta clínica. Los dos pueden convivir: se puede cerrar con
 * una consulta firmada y además dejar dicho cómo se fue el animal.
 *
 * El cierre NO es un `UPDATE` sobre `visits`: va por el RPC
 * `close_visit_with_appointment` (059), que además marca `attended` el turno
 * del que vino la visita, si vino de uno. Tiene que ser una sola transacción —
 * partido en dos `UPDATE` desde acá, un fallo en el segundo dejaba la visita
 * cerrada y el turno colgado en `scheduled` sin que nadie se enterara. El
 * porqué de que sea `SECURITY DEFINER` (y no dos updates con RLS) está en el
 * encabezado de la migración: las políticas de `appointments` exigen Premium y
 * las de `visits` no.
 */
export async function closeVisit(
  visitId: string,
  {
    medicalRecordId,
    resumen,
  }: { medicalRecordId?: string; resumen?: string } = {},
): Promise<ActionResult> {
  const vet = await requireVet();
  try {
    await withUser(vet.usuario.id, (tx) =>
      rpc(tx, "close_visit_with_appointment", {
        p_visit_id: visitId,
        p_medical_record_id: medicalRecordId ?? null,
        p_summary: resumen?.trim() || null,
      }),
    );
  } catch (error) {
    console.error("closeVisit", error);
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath("/veterinaria/sala-de-espera");
  revalidatePath("/veterinaria/gestion");
  // La agenda cambia junto con el cierre: el turno vinculado pasó a `attended`.
  revalidatePath("/veterinaria/turnos");
  return { success: true };
}

/**
 * Los turnos de hoy de una mascota, para ofrecerlos al registrar la llegada.
 *
 * Vive acá y no en `appointment-actions.ts` porque es del mostrador, no de la
 * agenda: aquel archivo entero pasa por `requirePremiumVet()` y esto tiene que
 * funcionar —devolviendo una lista vacía— en una clínica sin Premium.
 */
export async function listPetAppointmentsForDay(
  petId: string,
): Promise<AppointmentListItem[]> {
  await requireVet();
  return getPetAppointmentsForDay(petId);
}

/** Se fue antes de que la atendieran. Queda registrado, no se borra. */
export async function markNoShow(visitId: string): Promise<ActionResult> {
  const vet = await requireVet();
  const ok = await escribir(
    vet.usuario.id,
    sql`update visits set status = 'no_show', completed_at = now()
         where id = ${visitId} and institution_id = ${vet.institucionId}`,
  );

  if (!ok) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/sala-de-espera");
  return { success: true };
}

/**
 * La cola del día.
 *
 * Se filtra por fecha de llegada y no por estado: quien ya se atendió tiene que
 * seguir viéndose abajo, porque el mostrador lo usa para saber qué pasó hoy.
 */
export async function listWaitingRoom(fecha?: string) {
  const vet = await requireVet();
  const dia = fecha ?? hoyArgentina();
  const { inicio, fin } = limitesDiaArgentina(dia);

  // La cola de esta institución (antes la acotaba la RLS de `visits`).
  const data = await query<VisitRow>(
    getDb(),
    sql`${VISIT_SELECT}
        where v.institution_id = ${vet.institucionId}
          and v.checked_in_at >= ${inicio} and v.checked_in_at < ${fin}
        order by v.checked_in_at`,
  );

  return ordenarCola(data.map(toVisit));
}
