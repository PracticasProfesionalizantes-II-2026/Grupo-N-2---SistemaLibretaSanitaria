"use server";

import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  type AbsenceStatus,
  absenceStatusSchema,
  type DayOfWeek,
  type Schedule,
  onCallScheduleSchema,
  scheduleSchema,
} from "@/features/vet/schemas/schedule-schemas";
import { teamInviteSchema } from "@/features/vet/schemas/team-invite-schemas";
import type { TeamInviteRole } from "@/features/vet/data/team-invites";
import { requireVet, type VetSession } from "@/features/vet/lib/vet-session";
import {
  dbError,
  getDb,
  insertInto,
  query,
  rpc,
  updateSet,
  withUser,
} from "@/lib/db";
import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import type { Professional } from "@/types/vet";

/**
 * Institución y equipo del panel veterinario.
 *
 * La base no aplica RLS para la conexión de la app: lo que antes exigían las
 * políticas (solo el titular edita la institución y gestiona invitaciones) se
 * comprueba acá con `rolEnInstitucion`.
 */

const GENERIC_ERROR = "No pudimos guardar los cambios. Probá de nuevo.";

const ROL: Record<string, Professional["rol"]> = {
  owner: "titular",
  professional: "profesional",
  assistant: "asistente",
};

const esTitular = (vet: VetSession) => vet.rolEnInstitucion === "owner";

/** Corre la escritura como el veterinario y devuelve las filas `returning`. */
async function escribir<Row = Record<string, unknown>>(
  vet: VetSession,
  sentencia: SQL,
): Promise<Row[] | null> {
  try {
    return await withUser(vet.usuario.id, (tx) => query<Row>(tx, sentencia));
  } catch (error) {
    console.error("institution-actions", error);
    return null;
  }
}

async function actualizarInstitucion(
  vet: VetSession,
  cambios: Record<string, unknown>,
): Promise<boolean> {
  if (!esTitular(vet)) return false;
  const filas = await escribir(
    vet,
    sql`${updateSet("vet_institutions", cambios)}
        where id = ${vet.institucionId} returning id`,
  );
  return Boolean(filas?.length);
}

export async function updateInstitution(input: {
  nombre: string;
  direccion: string;
  telefono?: string;
  web?: string;
  latitud?: number;
  longitud?: number;
}): Promise<ActionResult> {
  const vet = await requireVet();

  const ok = await actualizarInstitucion(vet, {
    name: input.nombre.trim(),
    address: input.direccion.trim(),
    phone: input.telefono?.trim() || null,
    website: input.web?.trim() || null,
    latitude: input.latitud ?? null,
    longitude: input.longitud ?? null,
  });

  if (!ok) {
    return {
      success: false,
      error:
        "No se pudieron guardar los datos. Solo el titular de la veterinaria puede editarlos.",
    };
  }

  revalidatePath("/veterinaria/institucion");
  return { success: true };
}

export async function updateSchedule(
  schedule: Schedule,
): Promise<ActionResult> {
  const parsed = scheduleSchema.safeParse(schedule);
  if (!parsed.success) {
    return { success: false, error: "Revisá los horarios cargados." };
  }

  const vet = await requireVet();
  const ok = await actualizarInstitucion(vet, {
    schedule: JSON.stringify(parsed.data),
  });

  if (!ok) {
    return {
      success: false,
      error:
        "No se pudieron guardar los horarios. Solo el titular de la veterinaria puede editarlos.",
    };
  }

  revalidatePath("/veterinaria/institucion");
  return { success: true };
}

export async function updateOnCallSchedule(
  days: DayOfWeek[],
): Promise<ActionResult> {
  const parsed = onCallScheduleSchema.safeParse(days);
  if (!parsed.success) {
    return { success: false, error: "Revisá los días de guardia." };
  }

  const vet = await requireVet();
  const ok = await actualizarInstitucion(vet, {
    on_call_schedule: JSON.stringify(parsed.data),
  });

  if (!ok) {
    return {
      success: false,
      error:
        "No se pudieron guardar los días de guardia. Solo el titular de la veterinaria puede editarlos.",
    };
  }

  revalidatePath("/veterinaria/institucion");
  return { success: true };
}

/** Guardia propia: cada profesional prende o apaga la suya. */
export async function setOnCall(
  activo: boolean,
): Promise<ActionResult<{ onCall: boolean }>> {
  const vet = await requireVet();

  const filas = await escribir<{ on_call: boolean }>(
    vet,
    sql`update vet_professionals set on_call = ${activo}
         where id = ${vet.profesionalId} returning on_call`,
  );

  if (!filas?.length) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/institucion");
  return { success: true, onCall: filas[0].on_call };
}

export async function setAbsenceStatus(
  estado: AbsenceStatus,
): Promise<ActionResult<{ absenceStatus: AbsenceStatus; onCall: boolean }>> {
  const parsed = absenceStatusSchema.safeParse(estado);
  if (!parsed.success) {
    return { success: false, error: GENERIC_ERROR };
  }

  const vet = await requireVet();

  const filas = await escribir<{ absence_status: string; on_call: boolean }>(
    vet,
    sql`update vet_professionals set absence_status = ${parsed.data}
         where id = ${vet.profesionalId} returning absence_status, on_call`,
  );

  if (!filas?.length) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/institucion");
  return {
    success: true,
    absenceStatus: absenceStatusSchema.parse(filas[0].absence_status),
    onCall: filas[0].on_call,
  };
}

/** El equipo activo de la institución, con si cada uno cargó su firma. */
export async function listTeam(): Promise<Professional[]> {
  const vet = await requireVet();

  const data = await query<{
    id: string;
    license_number: string;
    license_validated: boolean;
    specialty: string | null;
    role_in_institution: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    firma_cargada: boolean;
  }>(
    getDb(),
    sql`select vp.id, vp.license_number, vp.license_validated, vp.specialty,
               vp.role_in_institution, p.first_name, p.last_name, u.email,
               exists(select 1 from vet_signatures s
                       where s.vet_professional_id = vp.id
                         and s.superseded_at is null) as firma_cargada
          from vet_professionals vp
          left join profiles p on p.id = vp.profile_id
          left join auth.users u on u.id = vp.profile_id
         where vp.institution_id = ${vet.institucionId} and vp.removed_at is null
         order by vp.created_at`,
  );

  return data.map((row) => ({
    id: row.id,
    nombre:
      [row.first_name, row.last_name].filter(Boolean).join(" ") || "Sin nombre",
    matricula: row.license_number,
    especialidad: row.specialty ?? "",
    email: row.email ?? "",
    rol: ROL[row.role_in_institution] ?? "profesional",
    estado: row.license_validated ? "activo" : "matricula-pendiente",
    permisos:
      row.role_in_institution === "owner"
        ? [
            "consultas",
            "vacunas",
            "agenda",
            "pacientes",
            "institucion",
            "reportes",
          ]
        : row.role_in_institution === "assistant"
          ? ["agenda", "pacientes"]
          : ["consultas", "vacunas", "agenda", "pacientes"],
    firmaCargada: row.firma_cargada,
  }));
}

const inviterNombreCompleto = (usuario: {
  nombre: string;
  apellido: string;
  email: string;
}) =>
  [usuario.nombre, usuario.apellido].filter(Boolean).join(" ") || usuario.email;

/**
 * Invita a alguien al equipo por email. El tope de lugares por rol lo hace
 * cumplir la base (trigger de la 058); un duplicado choca con el `UNIQUE`.
 */
export async function inviteProfessional(
  email: string,
  rol: TeamInviteRole,
): Promise<ActionResult> {
  const vet = await requireVet();

  if (!esTitular(vet)) {
    return {
      success: false,
      error: "Solo el titular de la veterinaria puede invitar profesionales.",
    };
  }

  const parsed = teamInviteSchema.safeParse({ email, rol });
  if (!parsed.success) {
    return { success: false, error: "Revisá el email y el rol elegido." };
  }

  const invitedEmail = parsed.data.email.trim().toLowerCase();

  const [yaEsta] = await query(
    getDb(),
    sql`select 1 from vet_professionals vp
          join auth.users u on u.id = vp.profile_id
         where vp.institution_id = ${vet.institucionId}
           and vp.removed_at is null and lower(u.email) = ${invitedEmail}`,
  );
  if (yaEsta) {
    return { success: false, error: "Esa persona ya forma parte del equipo." };
  }

  try {
    await withUser(vet.usuario.id, (tx) =>
      tx.execute(
        insertInto("vet_team_invites", {
          institution_id: vet.institucionId,
          invited_email: invitedEmail,
          role_in_institution: parsed.data.rol,
          institution_name: vet.institucion.nombre,
          inviter_name: inviterNombreCompleto(vet.usuario),
          invited_by: vet.usuario.id,
        }),
      ),
    );
  } catch (error) {
    const { code } = dbError(error);
    return {
      success: false,
      error:
        code === "23505"
          ? "Ya existe una invitación para esa dirección en esta institución."
          : "La veterinaria no tiene lugar disponible para sumar a alguien más con ese rol.",
    };
  }

  revalidatePath("/veterinaria/institucion");
  return { success: true };
}

/** Da de baja a un profesional. Quién puede hacerlo lo decide la RPC (058). */
export async function removeProfessional(
  professionalId: string,
): Promise<ActionResult> {
  const vet = await requireVet();

  let revocado = false;
  try {
    const [fila] = await withUser(vet.usuario.id, (tx) =>
      rpc<{ revoke_vet_team_member: boolean }>(tx, "revoke_vet_team_member", {
        p_professional_id: professionalId,
      }),
    );
    revocado = Boolean(fila?.revoke_vet_team_member);
  } catch (error) {
    return {
      success: false,
      error: dbError(error).message || GENERIC_ERROR,
    };
  }

  if (!revocado) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/institucion");
  return { success: true };
}

export async function revokeTeamInvite(
  inviteId: string,
): Promise<ActionResult> {
  const vet = await requireVet();
  if (!esTitular(vet)) return { success: false, error: GENERIC_ERROR };

  const filas = await escribir(
    vet,
    sql`delete from vet_team_invites
         where id = ${inviteId} and institution_id = ${vet.institucionId}
        returning id`,
  );
  if (!filas) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/institucion");
  return { success: true };
}

/** Renueva el vencimiento de una invitación pendiente (no hay correo que reenviar). */
export async function resendTeamInvite(
  inviteId: string,
): Promise<ActionResult> {
  const vet = await requireVet();
  if (!esTitular(vet)) return { success: false, error: GENERIC_ERROR };

  const filas = await escribir(
    vet,
    sql`update vet_team_invites set expires_at = now() + interval '30 days'
         where id = ${inviteId} and institution_id = ${vet.institucionId}
           and status = 'pending'
        returning id`,
  );

  if (!filas?.length) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/veterinaria/institucion");
  return { success: true };
}
