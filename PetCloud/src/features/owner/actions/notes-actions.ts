"use server";

import "server-only";

import { sql } from "drizzle-orm";

import { requireUser } from "@/features/auth/lib/current-user";
import {
  GENERIC_ERROR,
  revalidatePet,
} from "@/features/owner/lib/pet-actions-shared";
import { query, withUser } from "@/lib/db";
import type { ActionResult } from "@/features/owner/actions/pets-actions";

/**
 * Notas libres del dueño sobre la mascota.
 */

export async function addPetNote(
  petId: string,
  contenido: string,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!contenido.trim()) {
    return { success: false, error: "La nota no puede estar vacía." };
  }

  const insertada = await withUser(user.id, (tx) =>
    query(
      tx,
      sql`insert into pet_notes (pet_id, content, created_by_id)
          select ${petId}, ${contenido.trim()}, ${user.id}
           where has_pet_access(${petId}, 'edit')
          returning id`,
    ),
  ).catch(() => []);

  if (insertada.length === 0) return { success: false, error: GENERIC_ERROR };

  revalidatePet(petId);
  return { success: true };
}

export async function updatePetNote(
  noteId: string,
  petId: string,
  contenido: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const [actualizada] = await withUser(user.id, (tx) =>
    query(
      tx,
      sql`update pet_notes set content = ${contenido.trim()}
           where id = ${noteId} and has_pet_access(pet_id, 'edit')
          returning id`,
    ),
  ).catch(() => []);

  if (!actualizada) {
    return {
      success: false,
      error: "No se pudo editar la nota: puede que ya no exista.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

export async function deletePetNote(
  noteId: string,
  petId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const [borrada] = await withUser(user.id, (tx) =>
    query(
      tx,
      sql`delete from pet_notes
           where id = ${noteId} and has_pet_access(pet_id, 'edit')
          returning id`,
    ),
  ).catch(() => []);

  if (!borrada) {
    return {
      success: false,
      error: "No se pudo eliminar la nota: puede que ya no exista.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}
