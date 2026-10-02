"use server";

import "server-only";

import { sql } from "drizzle-orm";

import { requireUser } from "@/features/auth/lib/current-user";
import {
  borrarArchivosDeMascotas,
  borrarFotosDePerfil,
} from "@/features/owner/lib/pet-storage";
import { deleteUser } from "@/lib/auth/admin";
import { getDb, query } from "@/lib/db";
import type { ActionResult } from "@/features/owner/actions/pets-actions";

/**
 * Elimina la cuenta del dueño de forma real e irreversible.
 *
 * Borra la fila de `auth.users` (`deleteUser`). `profiles.id` referencia
 * `auth.users(id) ON DELETE CASCADE` (001), así que ese borrado ya arrastra
 * el resto: mascotas, vacunas, documentos, etc.
 *
 * Antes de que el CASCADE llegue a `pets`, el trigger `profiles_reassign_pet_owner`
 * (036) reasigna a un codueño real cualquier mascota que tenga uno — esa
 * mascota NO se borra, solo deja de ser tuya. Solo desaparecen las mascotas
 * de las que sos el único dueño.
 *
 * No cierra la sesión: el que llama tiene que hacerlo después (la cookie
 * sigue siendo válida hasta que se borre, aunque el usuario que representaba
 * ya no exista).
 */
export async function deleteOwnerAccount(): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();

  // Se anotan antes de borrar porque después no hay de dónde sacar los ids.
  const anteriores = await query<{ id: string }>(
    db,
    sql`select id from pets where owner_id = ${user.id}`,
  );

  try {
    await deleteUser(user.id);
  } catch {
    return {
      success: false,
      error: "No pudimos eliminar tu cuenta. Probá de nuevo.",
    };
  }

  /**
   * Cuáles desaparecieron de verdad.
   *
   * No alcanza con limpiar todas las que eran suyas: el trigger
   * `profiles_reassign_pet_owner` (036) le pasa a un codueño real las mascotas
   * que tengan uno, y esas siguen vivas — borrarles las fotos sería destruir
   * los datos de otra persona.
   *
   * Se consulta cuáles quedaron en vez de repetir la regla del trigger acá: el
   * día que esa regla cambie, esto sigue estando bien.
   */
  const ids = anteriores.map((pet) => pet.id);

  if (ids.length > 0) {
    const sobrevivientes = await query<{ id: string }>(
      db,
      sql`select id from pets where id = any(${sql.param(ids)}::uuid[])`,
    );

    const vivas = new Set(sobrevivientes.map((pet) => pet.id));
    await borrarArchivosDeMascotas(ids.filter((id) => !vivas.has(id)));
  }

  await borrarFotosDePerfil(user.id);

  return { success: true };
}
