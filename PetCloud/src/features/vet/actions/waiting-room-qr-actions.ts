"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { generateWaitingRoomQrCode } from "@/lib/qr-code";
import { getDb, query, withUser } from "@/lib/db";
import { finDeDiaLocal } from "@/features/vet/lib/fin-de-dia";
import { requireVet } from "@/features/vet/lib/vet-session";
import type { ActionResult } from "@/features/vet/actions/consultation-actions";

/**
 * El QR de la sala de espera: un código que la institución emite para que
 * cualquier dueño con el celular a mano se anote solo, sin pasar por el
 * mostrador.
 *
 * A diferencia del collar (`pet_qr_codes`), este código rota: emitir uno
 * nuevo tiene que dejar sin efecto el anterior. El índice único
 * parcial `idx_waiting_room_qr_sessions_live` (053) es quien de verdad hace
 * cumplir "una sola sesión viva por institución"; esta acción sólo se
 * adelanta a esa restricción revocando antes de insertar — y esa revocación
 * es incondicional, no sólo "si hay una vigente": una sesión vencida pero
 * sin revocar sigue ocupando el lugar del índice parcial (filtra sólo por
 * `revoked_at IS NULL`), así que sin este paso el INSERT de abajo choca
 * contra el índice.
 */

const GENERIC_ERROR = "No pudimos completar la operación. Probá de nuevo.";

export type WaitingRoomQrSession = {
  id: string;
  code: string;
  validoHasta: string;
};

function toWaitingRoomQrSession(row: {
  id: string;
  code: string;
  valid_until: string;
}): WaitingRoomQrSession {
  return { id: row.id, code: row.code, validoHasta: row.valid_until };
}

/**
 * Emite el QR de la sala de espera: revoca cualquier sesión viva previa de
 * esta institución (vencida o no) y crea una nueva.
 */
export async function issueWaitingRoomQrSession(): Promise<
  ActionResult<{ session: WaitingRoomQrSession }>
> {
  const vet = await requireVet();
  // Revoca toda sesión sin revocar de esta institución, viva o vencida: sin
  // esto, el INSERT de abajo chocaría contra
  // `idx_waiting_room_qr_sessions_live` (053).
  let data: { id: string; code: string; valid_until: string } | undefined;
  try {
    data = await withUser(vet.usuario.id, async (tx) => {
      await tx.execute(sql`
        update waiting_room_qr_sessions set revoked_at = now()
         where institution_id = ${vet.institucionId} and revoked_at is null`);
      const [creada] = await query<{
        id: string;
        code: string;
        valid_until: string;
      }>(
        tx,
        sql`insert into waiting_room_qr_sessions
              (code, institution_id, valid_until, issued_by)
            values (${generateWaitingRoomQrCode()}, ${vet.institucionId},
              ${finDeDiaLocal()}, ${vet.profesionalId})
            returning id, code, valid_until`,
      );
      return creada;
    });
  } catch (error) {
    console.error("issueWaitingRoomQrSession", error);
  }

  if (!data) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/sala-de-espera");
  return { success: true, session: toWaitingRoomQrSession(data) };
}

/**
 * Revoca la sesión vigente a mano (por ejemplo, si se imprimió y quedó
 * expuesta en un lugar que ya no corresponde). Sin filtro explícito por
 * institución: la política `waiting_room_qr_sessions_update_institution`
 * (053) ya exige `is_institution_member(institution_id)`, así que el id de
 * una sesión de otra institución no matchea ninguna fila.
 */
export async function revokeWaitingRoomQrSession(
  sessionId: string,
): Promise<ActionResult> {
  const vet = await requireVet();
  try {
    await withUser(vet.usuario.id, (tx) =>
      tx.execute(sql`
        update waiting_room_qr_sessions set revoked_at = now()
         where id = ${sessionId} and institution_id = ${vet.institucionId}
           and revoked_at is null`),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath("/veterinaria/sala-de-espera");
  return { success: true };
}

/**
 * La sesión viva de la institución actual, si la hay. `null` es un caso
 * real (todavía no se emitió ningún QR), no un error.
 *
 * El filtro coincide exactamente con `idx_waiting_room_qr_sessions_live`
 * (053), así que nunca puede haber más de una fila.
 */
export async function getLiveWaitingRoomQrSession(): Promise<WaitingRoomQrSession | null> {
  const vet = await requireVet();
  const [data] = await query<{ id: string; code: string; valid_until: string }>(
    getDb(),
    sql`select id, code, valid_until from waiting_room_qr_sessions
         where institution_id = ${vet.institucionId} and revoked_at is null
         limit 1`,
  );

  return data ? toWaitingRoomQrSession(data) : null;
}
