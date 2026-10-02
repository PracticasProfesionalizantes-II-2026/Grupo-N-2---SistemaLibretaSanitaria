import "server-only";

import { sql } from "drizzle-orm";

import { getCurrentUser } from "@/features/auth/lib/current-user";
import { requireVet } from "@/features/vet/lib/vet-session";
import { getDb, query, rpc } from "@/lib/db";

/** Rol de la invitación, en el vocabulario de la base (058). */
export type TeamInviteRole = "professional" | "assistant";

/**
 * Lecturas de `vet_team_invites` (migración 058) para las dos puntas del
 * ciclo: el titular que invitó y quien recibió la invitación.
 *
 * Ninguna de las dos funciones recibe un `institutionId` explícito, mismo
 * criterio que `owner/data/vet-directory.ts` y
 * `owner/data/owner-queries.ts#listMyPendingPetInvites`: el alcance sale de
 * la sesión (`requireVet()` o `getCurrentUser()`), y RLS
 * (`vet_team_invites_select`) es quien de verdad decide qué fila es visible.
 */

/** Una invitación pendiente, vista desde el titular que la mandó. */
export type OwnerTeamInvite = {
  id: string;
  email: string;
  rol: TeamInviteRole;
  creadaEl: string;
  venceEl: string;
  vencida: boolean;
  /**
   * El mismo chequeo de cupo que corre `accept_team_invite()`
   * (`institution_can_add_member(…, p_include_pending = false)`), evaluado
   * ahora mismo. En `false` significa que aceptar esta invitación hoy
   * fallaría por falta de lugar — `vet-plan-limits` Requirement "A pending
   * invite that no longer fits the plan is refused at acceptance, and
   * flagged before that". El titular lo ve acá antes de que la persona
   * invitada lo intente y se encuentre con el rechazo.
   */
  aceptable: boolean;
};

/**
 * Invitaciones pendientes de la institución del titular, incluidas las
 * vencidas: siguen a la vista para poder reenviarlas
 * (`vet-team-invitations` Requirement "An invite expires 30 days after
 * creation", escenario "An expired invite stays visible to the owner").
 */
export async function listOwnerTeamInvites(): Promise<OwnerTeamInvite[]> {
  const vet = await requireVet();
  const db = getDb();
  const invites = await query<{
    id: string;
    invited_email: string;
    role_in_institution: string;
    expires_at: string;
    created_at: string;
  }>(
    db,
    sql`select id, invited_email, role_in_institution, expires_at, created_at
          from vet_team_invites
         where institution_id = ${vet.institucionId} and status = 'pending'
         order by created_at`,
  );
  if (invites.length === 0) return [];

  const ahora = Date.now();

  // Como mucho dos llamadas — una por cada rol invitable —, nunca una por
  // invitación: `institution_can_add_member()` cuenta filas de toda la
  // institución, no de una invitación puntual, así que repetirla para el
  // mismo rol volvería a dar la misma respuesta.
  const roles = Array.from(
    new Set(invites.map((invite) => invite.role_in_institution)),
  );
  const aceptablePorRol = new Map<string, boolean>();

  await Promise.all(
    roles.map(async (rol) => {
      const [fila] = await rpc<{ institution_can_add_member: boolean }>(
        db,
        "institution_can_add_member",
        {
          p_institution_id: vet.institucionId,
          p_role: rol,
          p_include_pending: false,
        },
      );
      aceptablePorRol.set(rol, Boolean(fila?.institution_can_add_member));
    }),
  );

  return invites.map((invite) => ({
    id: invite.id,
    email: invite.invited_email,
    rol: invite.role_in_institution as TeamInviteRole,
    creadaEl: invite.created_at,
    venceEl: invite.expires_at,
    vencida: new Date(invite.expires_at).getTime() < ahora,
    aceptable: aceptablePorRol.get(invite.role_in_institution) ?? true,
  }));
}

/** Una invitación pendiente, vista desde quien la recibió. */
export type MyTeamInvite = {
  id: string;
  institucionNombre: string;
  inviterNombre: string;
  rol: TeamInviteRole;
  venceEl: string;
};

/**
 * Invitaciones pendientes dirigidas al email confirmado de quien pide.
 *
 * El `WHERE` de acá abajo (pending, no vencida, `invited_email` propio) ya lo
 * exige RLS (`vet_team_invites_select`, brazo del invitado) — se repite acá
 * para no traer del servidor filas que la política de todos modos filtraría,
 * mismo motivo que `listMyPendingPetInvites()`.
 */
export async function listMyPendingTeamInvites(): Promise<MyTeamInvite[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const data = await query<{
    id: string;
    institution_name: string;
    inviter_name: string;
    role_in_institution: string;
    expires_at: string;
  }>(
    getDb(),
    sql`select id, institution_name, inviter_name, role_in_institution, expires_at
          from vet_team_invites
         where status = 'pending' and invited_email = ${user.email.toLowerCase()}
           and expires_at > now()
         order by created_at`,
  );

  return data.map((row) => ({
    id: row.id,
    institucionNombre: row.institution_name,
    inviterNombre: row.inviter_name,
    rol: row.role_in_institution as TeamInviteRole,
    venceEl: row.expires_at,
  }));
}
