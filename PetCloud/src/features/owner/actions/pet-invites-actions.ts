"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/features/auth/lib/current-user";
import type { ActionResult } from "@/features/owner/actions/pets-actions";
import { query, rpc, withUser } from "@/lib/db";

/**
 * Ciclo de vida de una invitación de coautoría, del lado de quien la recibe
 * (aceptar/rechazar) y del dueño que la mandó (revocar).
 *
 * `acceptPetShareInvite`/`declinePetShareInvite` son wrappers finos sobre los
 * RPC `accept_pet_share_invite()` / `decline_pet_share_invite()` (migración
 * 045, `SECURITY DEFINER`): la validación de verdad — pendiente, no vencida,
 * dirigida al email confirmado de quien llama — vive ahí adentro. Repetirla
 * acá sería una segunda fuente de verdad que puede desincronizarse de la
 * base.
 */

const GENERIC_ERROR = "No pudimos procesar la invitación. Probá de nuevo.";

/**
 * Acepta una invitación pendiente y notifica a las dos partes.
 *
 * El RPC ya crea (o actualiza sin degradar) la fila de `pet_shared_access`;
 * esta acción se ocupa de lo que el RPC no puede: escribir en
 * `notifications`, que no tiene política de INSERT para `authenticated`
 * (migración 002) y necesita la clave de servicio — mismo camino que
 * `notificarTurnoAgendado()` (`vet/actions/appointment-actions.ts`).
 *
 * La relectura de `invited_by`/`invited_email`/`pet_name` para armar esa
 * notificación usa la clave de servicio a propósito: apenas el RPC acepta,
 * el estado de la fila pasa a 'accepted' y (si el permiso invitado era
 * 'view' o 'edit') quien acepta puede seguir sin cumplir `is_pet_owner()` —
 * ninguno de los dos brazos de `pet_share_invites_select` le garantiza
 * releer esa fila con su propia sesión.
 *
 * Perder la notificación no deshace el acceso ya otorgado: si no se
 * encuentra la invitación para notificar, el accept igual se considera
 * exitoso.
 */
export async function acceptPetShareInvite(
  inviteId: string,
): Promise<ActionResult<{ petId: string }>> {
  const user = await requireUser();

  let petId: string | null = null;
  try {
    const [fila] = await withUser(user.id, (tx) =>
      rpc<{ accept_pet_share_invite: string | null }>(
        tx,
        "accept_pet_share_invite",
        { p_invite_id: inviteId },
      ),
    );
    petId = fila?.accept_pet_share_invite ?? null;
  } catch {
    petId = null;
  }

  if (!petId) {
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath(`/mascotas/${petId}`, "layout");
  revalidatePath("/mis-mascotas");
  revalidatePath("/inicio");

  return { success: true, petId };
}

/**
 * Rechaza una invitación pendiente.
 *
 * Nadie se notifica: la spec de notificaciones (`pet-access-notifications`)
 * no pide avisar a nadie cuando se rechaza, solo cuando se otorga acceso o se
 * acepta una invitación.
 */
export async function declinePetShareInvite(
  inviteId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const declinada = await withUser(user.id, (tx) =>
    rpc<{ decline_pet_share_invite: boolean }>(tx, "decline_pet_share_invite", {
      p_invite_id: inviteId,
    }),
  ).then(
    ([fila]) => Boolean(fila?.decline_pet_share_invite),
    () => false,
  );

  if (!declinada) return { success: false, error: GENERIC_ERROR };

  return { success: true };
}

/**
 * El dueño da de baja una invitación todavía pendiente — el equivalente de
 * `revokePetAccess`, pero del lado de las invitaciones.
 *
 * RLS (`pet_share_invites_delete`, migración 045) ya restringe el borrado a
 * `is_pet_owner(pet_id)` de la fila real, así que no hace falta clave de
 * servicio ni revalidar acá el `petId` recibido contra la invitación: la
 * política lo hace por su cuenta, igual que `revokePetAccess` no revalida
 * `accessId` contra `petId`.
 */
export async function revokePetShareInvite(
  inviteId: string,
  petId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  // Solo un dueño de la mascota revoca la invitación.
  try {
    await withUser(user.id, (tx) =>
      query(
        tx,
        sql`delete from pet_share_invites
             where id = ${inviteId} and is_pet_owner(pet_id) returning id`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath(`/mascotas/${petId}`, "layout");

  return { success: true };
}
