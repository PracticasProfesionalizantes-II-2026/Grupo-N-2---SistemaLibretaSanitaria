import "server-only";

import { sql } from "drizzle-orm";

import { getDb, query } from "@/lib/db";

/**
 * La última decisión del backoffice sobre la matrícula de quien está logueado
 * (`vet_license_reviews`, migración 060).
 *
 * Se lee con la sesión y no con la service role: la política
 * `vet_license_reviews_select` ya deja que el profesional vea las suyas y a
 * nadie más. Es el camino por el que el motivo de un rechazo llega a la
 * persona; sin esta lectura la nota quedaba guardada y solo la veía el admin.
 */
export type UltimaRevisionMatricula = {
  validada: boolean;
  nota: string | null;
  fecha: string;
};

export async function getMyLatestLicenseReview(
  professionalId: string,
): Promise<UltimaRevisionMatricula | null> {
  const [data] = await query<{
    validated: boolean;
    note: string | null;
    occurred_at: string;
  }>(
    getDb(),
    sql`select validated, note, occurred_at from vet_license_reviews
         where professional_id = ${professionalId}
         order by occurred_at desc limit 1`,
  ).catch(() => []);
  if (!data) return null;

  return {
    validada: data.validated,
    nota: data.note,
    fecha: data.occurred_at,
  };
}
