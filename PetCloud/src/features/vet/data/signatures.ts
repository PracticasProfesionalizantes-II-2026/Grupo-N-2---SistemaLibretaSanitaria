import "server-only";

import { sql } from "drizzle-orm";

import { requireVet } from "@/features/vet/lib/vet-session";
import { getDb, query } from "@/lib/db";
import { storageUrl } from "@/lib/storage";
import type { Tables } from "@/types/database";

/**
 * Lectura de `vet_signatures` (migración 063; dibujo opcional desde la 067)
 * para la pantalla de Ajustes.
 *
 * No recibe ningún id: el alcance sale de la sesión y de RLS
 * (`vet_signatures_select`), igual que `data/team-invites.ts`. Nadie ve las
 * firmas de otro profesional aunque esta consulta se escribiera mal.
 */

export type FirmaRegistrada = {
  id: string;
  aclaracion: string;
  matricula: string;
  /** El texto exacto que esta persona aceptó al registrar esta firma. */
  declaracion: string;
  juradaEl: string;
  creadaEl: string;
  /** `null` mientras es la vigente; con fecha cuando otra firma la reemplazó. */
  reemplazadaEl: string | null;
  /**
   * Enlace firmado y temporal a la imagen. `null` en dos casos que la
   * pantalla no distingue porque no hace falta: la persona no dibujó nada
   * (`image_path` es `NULL` desde la 067), o el objeto no se pudo firmar. En
   * los dos, la fila igual se muestra — su valor probatorio no depende de
   * que la imagen cargue en esta pantalla.
   */
  url: string | null;
};

/** Cuánto vive el enlace con el que la pantalla muestra cada firma. */

/**
 * Todas mis firmas, la vigente primero y después el historial de más nueva a
 * más vieja.
 *
 * El historial se muestra entero y no se recorta: es lo que responde qué firma
 * estaba vigente cuando se firmó un documento, que es la razón por la que la
 * tabla guarda historia en vez de pisar la fila.
 */
export async function listMySignatures(): Promise<FirmaRegistrada[]> {
  const vet = await requireVet();
  const filas = await query<Tables<"vet_signatures">>(
    getDb(),
    sql`select * from vet_signatures
         where vet_professional_id = ${vet.profesionalId}
         order by created_at desc`,
  );

  return filas.map((fila) => ({
    id: fila.id,
    aclaracion: fila.clarification,
    matricula: fila.license_number,
    declaracion: fila.sworn_statement,
    juradaEl: fila.sworn_at,
    creadaEl: fila.created_at,
    reemplazadaEl: fila.superseded_at,
    url: fila.image_path ? storageUrl("vet-signatures", fila.image_path) : null,
  }));
}
