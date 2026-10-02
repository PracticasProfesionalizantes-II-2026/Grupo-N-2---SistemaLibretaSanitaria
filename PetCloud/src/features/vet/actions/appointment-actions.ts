"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requirePremiumVet } from "@/features/vet/lib/vet-premium";
import {
  appointmentRescheduleSchema,
  appointmentSchema,
  type AppointmentRescheduleValues,
  type AppointmentValues,
} from "@/features/vet/schemas/vet-schemas";
import { insertInto, query, updateSet, withUser } from "@/lib/db";
import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import type { Database } from "@/types/supabase";

/**
 * Turnos: crear, reprogramar, cancelar y marcar estado.
 *
 * Las cuatro pasan primero por `requirePremiumVet()` — no solo RLS
 * (`appointments_insert`/`appointments_update`, migración 041, ya exigen
 * `is_institution_member(institution_id) AND institution_has_premium(institution_id)`):
 * repetir el gate acá corta con un mensaje de PetCloud en vez de un error de
 * PostgreSQL, mismo criterio que cada acción de `subscription-actions.ts`.
 *
 * Turnos en sí no es solo del titular (a diferencia de la facturación, fase
 * 6): cualquier profesional de una institución Premium gestiona turnos —
 * requisito de la spec ("Any professional can manage appointments while
 * premium") — así que ninguna de estas cuatro llama a
 * `requireInstitutionOwner()`.
 */

const GENERIC_ERROR = "No pudimos guardar el turno. Probá de nuevo.";
const DATOS_INVALIDOS =
  "Revisá los datos del turno: falta algo o el formato no es válido.";
const NO_ENCONTRADO = "Ese turno no existe o no pertenece a tu institución.";

type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

/**
 * Actualiza un turno, siempre scopeado a la institución de quien pide —
 * defensa en profundidad además de RLS, mismo criterio que
 * `dashboard-actions.ts` filtrando `institution_id` aunque la política ya lo
 * haga. `.select().maybeSingle()` después del `UPDATE` es lo que distingue
 * "no existe/no es tuyo" (0 filas, sin error) de un error real de la base.
 */
async function actualizarTurno(
  userId: string,
  institucionId: string,
  id: string,
  cambios: AppointmentUpdate,
): Promise<ActionResult> {
  let filas: unknown[];
  try {
    filas = await withUser(userId, (tx) =>
      query(
        tx,
        sql`${updateSet("appointments", cambios)}
            where id = ${id} and institution_id = ${institucionId}
            returning id`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }
  if (filas.length === 0) return { success: false, error: NO_ENCONTRADO };

  return { success: true };
}

/**
 * Crea el turno y, si se guardó, notifica al dueño de la mascota.
 *
 * Perder la notificación no deshace el turno: si `notificarTurnoAgendado()`
 * fallara, preferimos un turno agendado sin aviso a ningún turno agendado.
 */
export async function createAppointment(
  input: AppointmentValues,
): Promise<ActionResult<{ id: string }>> {
  const vet = await requirePremiumVet();

  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: DATOS_INVALIDOS };

  let data: { id: string } | undefined;
  try {
    [data] = await withUser(vet.usuario.id, (tx) =>
      query<{ id: string }>(
        tx,
        sql`${insertInto("appointments", {
          institution_id: vet.institucionId,
          pet_id: parsed.data.petId,
          professional_id: parsed.data.profesionalId,
          starts_at: parsed.data.startsAt,
          duration_min: parsed.data.duracionMin,
          reason: parsed.data.motivo,
          internal_notes: parsed.data.notasInternas?.trim() || null,
          created_by: vet.profesionalId,
        })} returning id`,
      ),
    );
  } catch (error) {
    console.error("createAppointment", error);
  }

  if (!data) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/turnos");
  return { success: true, id: data.id };
}

/** Reprograma: solo cambia cuándo (y, si se manda, cuánto dura). */
export async function rescheduleAppointment(
  id: string,
  input: AppointmentRescheduleValues,
): Promise<ActionResult> {
  const vet = await requirePremiumVet();

  const parsed = appointmentRescheduleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: DATOS_INVALIDOS };

  const cambios: AppointmentUpdate = { starts_at: parsed.data.startsAt };
  if (parsed.data.duracionMin !== undefined) {
    cambios.duration_min = parsed.data.duracionMin;
  }

  const resultado = await actualizarTurno(
    vet.usuario.id,
    vet.institucionId,
    id,
    cambios,
  );
  if (!resultado.success) return resultado;

  revalidatePath("/veterinaria/turnos");
  return { success: true };
}

/**
 * Cancela: `status = 'cancelled'`, nunca un borrado — no hay política de
 * DELETE en `appointments` (migración 041) y el criterio es el mismo que
 * `reminders` (002).
 */
export async function cancelAppointment(id: string): Promise<ActionResult> {
  const vet = await requirePremiumVet();

  const resultado = await actualizarTurno(
    vet.usuario.id,
    vet.institucionId,
    id,
    {
      status: "cancelled",
    },
  );
  if (!resultado.success) return resultado;

  revalidatePath("/veterinaria/turnos");
  return { success: true };
}

/**
 * Los tres estados de seguimiento de una atención en curso — no la
 * cancelación, que tiene su propia acción porque además es la que decide si
 * el turno sigue contando para la agenda.
 */
export type AppointmentTrackingStatus = "confirmed" | "attended" | "no_show";

const ESTADOS_VALIDOS: readonly AppointmentTrackingStatus[] = [
  "confirmed",
  "attended",
  "no_show",
];

export async function markAppointmentStatus(
  id: string,
  estado: AppointmentTrackingStatus,
): Promise<ActionResult> {
  const vet = await requirePremiumVet();

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return { success: false, error: DATOS_INVALIDOS };
  }

  const resultado = await actualizarTurno(
    vet.usuario.id,
    vet.institucionId,
    id,
    {
      status: estado,
    },
  );
  if (!resultado.success) return resultado;

  revalidatePath("/veterinaria/turnos");
  return { success: true };
}
