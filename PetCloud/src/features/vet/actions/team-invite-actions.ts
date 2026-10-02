"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { toAppRole } from "@/config/roles";
import { requireUser } from "@/features/auth/lib/current-user";
import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import { unstable_update } from "@/auth";
import { getUserById } from "@/lib/auth/admin";
import { dbError, rpc, withUser } from "@/lib/db";

/**
 * Ciclo de vida de una invitación al equipo, del lado de quien la recibe.
 *
 * `acceptTeamInvite`/`declineTeamInvite` son wrappers finos sobre los RPC
 * `accept_team_invite()` / `decline_team_invite()` (migración 058,
 * `SECURITY DEFINER`): la validación de verdad — pendiente, no vencida,
 * dirigida al email confirmado de quien llama, cupo del plan, matrícula —
 * vive ahí adentro. Repetirla acá sería una segunda fuente de verdad que
 * puede desincronizarse de la base. El molde es
 * `owner/actions/pet-invites-actions.ts` sobre la 045.
 */

const GENERIC_ERROR = "No pudimos procesar la invitación. Probá de nuevo.";

/**
 * Acepta una invitación pendiente.
 *
 * El RPC ya deja escrito el rol de plataforma nuevo en
 * `raw_app_meta_data` (`sync_role_to_auth`), pero el JWT de esta sesión
 * todavía trae el anterior. `refreshSession()` pide
 * un token nuevo con el dato ya actualizado en la base, y se verifica el
 * claim en vez de asumir que vino bien: si sigue viejo,
 * `requiresRelogin: true` le dice a la pantalla que muestre una instrucción
 * en castellano en vez de mandar a la persona a `/veterinaria` para que la
 * rebote el proxy en silencio.
 */
export async function acceptTeamInvite(input: {
  inviteId: string;
  matricula?: string;
}): Promise<ActionResult<{ profesionalId: string; requiresRelogin: boolean }>> {
  const user = await requireUser();

  let profesionalId: string | null = null;
  try {
    const [fila] = await withUser(user.id, (tx) =>
      rpc<{ accept_team_invite: string | null }>(tx, "accept_team_invite", {
        p_invite_id: input.inviteId,
        p_license_number: input.matricula?.trim() || null,
      }),
    );
    profesionalId = fila?.accept_team_invite ?? null;
  } catch (error) {
    return {
      success: false,
      error: dbError(error).message || GENERIC_ERROR,
    };
  }

  if (!profesionalId) {
    return { success: false, error: GENERIC_ERROR };
  }

  // El rol cambió en la base: se refresca el JWT de Auth.js para que el
  // proxy lo vea. Si no quedó como veterinario, se pide volver a entrar.
  await unstable_update({}).catch(() => undefined);
  const actualizado = await getUserById(user.id);
  const requiresRelogin =
    toAppRole(actualizado?.app_metadata.role as string | undefined) !==
    "veterinario";

  revalidatePath("/", "layout");

  return { success: true, profesionalId, requiresRelogin };
}

/** Rechaza una invitación pendiente. No crea ninguna afiliación. */
export async function declineTeamInvite(
  inviteId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const rechazada = await withUser(user.id, (tx) =>
    rpc<{ decline_team_invite: boolean }>(tx, "decline_team_invite", {
      p_invite_id: inviteId,
    }),
  ).then(
    ([fila]) => Boolean(fila?.decline_team_invite),
    () => false,
  );

  if (!rechazada) return { success: false, error: GENERIC_ERROR };

  return { success: true };
}
