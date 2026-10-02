import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { getDb, query } from "@/lib/db";

/**
 * Alcance de "lo mío" en el portal del dueño: mascotas propias más las
 * compartidas con él vía `pet_shared_access`.
 *
 * La base no aplica RLS para la conexión de la app (ver docs/arquitectura.md),
 * así que toda lectura del portal acota explícitamente con este módulo.
 */

/** Condición SQL sobre la tabla `pets` (alias opcional). */
export function myPetScope(userId: string, alias = "pets"): SQL {
  const t = sql.raw(alias);
  return sql`(${t}.owner_id = ${userId} or ${t}.id in (
    select pet_id from pet_shared_access where shared_with_id = ${userId}))`;
}

/** Ids de las mascotas en alcance, para acotar tablas hijas. */
export async function myPetIds(userId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    getDb(),
    sql`select id from pets where ${myPetScope(userId)}`,
  );
  return rows.map((p) => p.id);
}

/**
 * Condición SQL: `petIdColumn` es una mascota de la que `userId` es dueño
 * (dueña registral o codueño con permiso `owner`). Es lo que antes decidía
 * `is_pet_owner()` en las políticas de RLS.
 */
export function iOwnPet(userId: string, petIdColumn: string): SQL {
  const col = sql.raw(petIdColumn);
  return sql`(${col} in (select id from pets where owner_id = ${userId})
    or ${col} in (select pet_id from pet_shared_access
                   where shared_with_id = ${userId} and permission = 'owner'))`;
}
