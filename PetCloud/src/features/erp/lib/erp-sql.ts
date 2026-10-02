import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { dbError, withUser, type Tx } from "@/lib/db";

/**
 * Nombre visible del profesional `column` (un `vet_professionals.id`), o
 * `null`. Para las columnas "responsable" de los movimientos del ERP.
 */
export function nombreProfesional(column: string): SQL {
  return sql`(select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from vet_professionals vp join profiles p on p.id = vp.profile_id
     where vp.id = ${sql.raw(column)})`;
}

/**
 * Corre una escritura del ERP como el usuario (las funciones `erp.*` leen
 * `auth.uid()`) y devuelve el error de Postgres, o `null` si salió bien.
 */
export async function erpWrite(
  userId: string,
  fn: (tx: Tx) => Promise<unknown>,
): Promise<{ message: string; code?: string } | null> {
  try {
    await withUser(userId, fn);
    return null;
  } catch (error) {
    return dbError(error);
  }
}
