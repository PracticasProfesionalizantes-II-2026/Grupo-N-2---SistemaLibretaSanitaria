"use server";

import "server-only";

import { requireUser } from "@/features/auth/lib/current-user";
import { WAITING_ROOM_QR_RE } from "@/lib/qr-code";
import { rpc, withUser, type FnRow } from "@/lib/db";

/**
 * Autogestión en la sala de espera: el dueño escanea el QR de la
 * institución y se anota solo, sin pasar por el mostrador.
 *
 * La única decisión de confianza pasa una sola vez, adentro de
 * `waiting_room_self_check_in()` (053) — `resolveWaitingRoomSession` de
 * acá abajo es sólo para el copy de la pantalla (nombre del código, si
 * "parece" vivo), nunca una segunda autorización. Duplicar esa lógica en el
 * cliente abriría una rendija: la función es la única fuente de verdad
 * sobre qué código está vivo y a qué mascota puede entrar.
 */

const GENERIC_ERROR = "No pudimos completar la operación. Probá de nuevo.";

export type WaitingRoomSessionPreview =
  { estado: "vivo" } | { estado: "no-vivo" };

/**
 * Sólo confirma si el código tiene el formato correcto — no consulta la
 * base ni el estado real de la sesión, porque el dueño no tiene SELECT
 * sobre `waiting_room_qr_sessions` (053, política deliberadamente sin
 * excepción para el dueño). El estado real sólo se conoce al intentar el
 * check-in.
 */
export async function resolveWaitingRoomSession(
  code: string,
): Promise<WaitingRoomSessionPreview> {
  return WAITING_ROOM_QR_RE.test(code.toUpperCase())
    ? { estado: "vivo" }
    : { estado: "no-vivo" };
}

export type SelfCheckInResult =
  | { estado: "ok"; visitId: string }
  | { estado: "code_not_live" }
  | { estado: "pet_unavailable" }
  | { estado: "already_waiting" }
  | { estado: "error"; error: string };

/**
 * Llama a `waiting_room_self_check_in(p_code, p_pet_id)` — los dos únicos
 * parámetros que existen. No hay `institution_id`, `reason`, `is_urgent` ni
 * `status` que declarar: la función no los acepta (Req. 10 del spec).
 *
 * `pet_unavailable` cubre tanto "no es tuya" como "no existe": el mensaje
 * que arma la vista para ese caso tiene que ser el mismo para los dos —
 * ver `self-check-in-view.tsx`. Este mapeo no distingue las dos causas
 * porque la base tampoco lo hace (Req. 5).
 */
export async function selfCheckIn(
  code: string,
  petId: string,
): Promise<SelfCheckInResult> {
  const user = await requireUser();

  let outcome: FnRow<"waiting_room_self_check_in"> | undefined;
  try {
    [outcome] = await withUser(user.id, (tx) =>
      rpc<FnRow<"waiting_room_self_check_in">>(
        tx,
        "waiting_room_self_check_in",
        { p_code: code, p_pet_id: petId },
      ),
    );
  } catch {
    return { estado: "error", error: GENERIC_ERROR };
  }

  if (!outcome) return { estado: "error", error: GENERIC_ERROR };

  switch (outcome.outcome) {
    case "ok":
      return { estado: "ok", visitId: outcome.visit_id as string };
    case "code_not_live":
      return { estado: "code_not_live" };
    case "pet_unavailable":
      return { estado: "pet_unavailable" };
    case "already_waiting":
      return { estado: "already_waiting" };
    default:
      return { estado: "error", error: GENERIC_ERROR };
  }
}
