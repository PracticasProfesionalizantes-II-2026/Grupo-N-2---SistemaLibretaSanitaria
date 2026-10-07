"use server";

import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/features/auth/lib/current-user";
import { toDbRepeat } from "@/features/owner/lib/mappers";
import { GENERIC_ERROR } from "@/features/owner/lib/pet-actions-shared";
import { insertInto, query, updateSet, withUser } from "@/lib/db";
import type { ActionResult } from "@/features/owner/actions/pets-actions";
import type { ReminderRepeat } from "@/types/schedule";
import { argentinaAUtcIso } from "@/lib/argentina-time";

/**
 * Recordatorios del dueño: alta, edición, descarte y borrado.
 */

/** Corre la escritura como el usuario y dice si tocó alguna fila. */
async function escribir(userId: string, sentencia: SQL): Promise<boolean> {
  try {
    const filas = await withUser(userId, (tx) =>
      query(tx, sql`${sentencia} returning 1`),
    );
    return filas.length > 0;
  } catch (error) {
    console.error("reminders", error);
    return false;
  }
}

/** La base guarda un solo valor; el formulario ofrece dos casillas. */
const canalDb = (canales: ("push" | "email")[]) =>
  canales.length === 2 ? "both" : (canales[0] ?? "push");

/**
 * Fecha y hora vienen del formulario en hora argentina. `new Date("…T10:00")`
 * las leía en la zona del proceso — UTC en producción —, así que un recordatorio
 * de las 10:00 quedaba programado para las 07:00.
 */
const programadoPara = (fecha: string, hora: string) =>
  argentinaAUtcIso(fecha, hora);

/** Lo que el formulario de recordatorio colecta, sin a qué mascota va. */
type ReminderInput = {
  titulo: string;
  descripcion?: string;
  fecha: string;
  hora: string;
  repeticion: ReminderRepeat;
  canales: ("push" | "email")[];
};

export async function createReminder(
  input: ReminderInput & { petId: string },
): Promise<ActionResult> {
  const user = await requireUser();

  const ok = await escribir(
    user.id,
    insertInto(
      "reminders",
      {
        pet_id: input.petId,
        owner_id: user.id,
        title: input.titulo.trim(),
        description: input.descripcion?.trim() || null,
        scheduled_at: programadoPara(input.fecha, input.hora),
        repeat: toDbRepeat(input.repeticion),
        channel: canalDb(input.canales),
        source: "manual",
      },
      sql`has_pet_access(${input.petId})`,
    ),
  );

  if (!ok) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/recordatorios");
  return { success: true };
}

/**
 * Editar un recordatorio manual.
 *
 * `petId` queda afuera del input a propósito: reasignar la fila a otra mascota
 * no es corregir un dato, es hacer desaparecer un recordatorio de una libreta y
 * aparecerlo en otra, arrastrando el historial de avisos ya despachados de la
 * primera. Para eso se borra y se crea de nuevo.
 *
 * El filtro `source = 'manual'` deja afuera filas heredadas de otro origen
 * (hoy solo se crean recordatorios manuales). Y la guarda de cero filas hace falta igual que en `deletePet`: si el filtro (o
 * RLS) no matchea nada, Postgres no devuelve error, toca cero filas y contesta
 * que salió bien.
 */
export async function updateReminder(
  reminderId: string,
  input: ReminderInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const actualizado = await escribir(
    user.id,
    sql`${updateSet("reminders", {
      title: input.titulo.trim(),
      description: input.descripcion?.trim() || null,
      scheduled_at: programadoPara(input.fecha, input.hora),
      repeat: toDbRepeat(input.repeticion),
      channel: canalDb(input.canales),
    })} where id = ${reminderId} and source = 'manual' and owner_id = ${user.id}`,
  );

  if (!actualizado) {
    return {
      success: false,
      error: "No se encontró el recordatorio.",
    };
  }

  revalidatePath("/recordatorios");
  return { success: true };
}

export async function deleteReminder(
  reminderId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  // Solo los manuales y propios.
  const borrado = await escribir(
    user.id,
    sql`delete from reminders
         where id = ${reminderId} and source = 'manual' and owner_id = ${user.id}`,
  );

  if (!borrado) {
    return {
      success: false,
      error: "No se encontró el recordatorio.",
    };
  }

  revalidatePath("/recordatorios");
  return { success: true };
}
