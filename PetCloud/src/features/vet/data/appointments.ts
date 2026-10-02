import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { requirePremiumVet } from "@/features/vet/lib/vet-premium";
import { requireVet } from "@/features/vet/lib/vet-session";
import { getDb, query } from "@/lib/db";
import { hoyArgentina, limitesDiaArgentina } from "@/lib/argentina-time";

/**
 * Lecturas de la agenda de turnos (migración 041), el primer módulo gateado
 * por Premium.
 *
 * `requirePremiumVet()` en cada función, no solo RLS: mismo criterio que
 * `data/clinics.ts` del lado municipal — la política ya filtra
 * (`is_institution_member(institution_id) AND institution_has_premium(institution_id)`),
 * pero repetir el gate acá deja explícito que esto es Turnos, en vez de
 * dejarlo implícito en un `institution_id` que cualquier lectura del panel
 * también filtra.
 *
 * Ninguna consulta acá usa `createAdminClient()`: todo lo que se lee es
 * exactamente lo que la sesión del profesional ya puede ver por política.
 */

/** Espejo del CHECK de `appointments.status` (migración 041), no un enum de Postgres. */
export type AppointmentStatus =
  "scheduled" | "confirmed" | "attended" | "no_show" | "cancelled";

export type AppointmentListItem = {
  id: string;
  /** `starts_at` tal cual la guarda la base: un solo TIMESTAMPTZ, sin separar fecha/hora (diseño D9). */
  startsAt: string;
  duracionMin: number;
  motivo: string;
  estado: AppointmentStatus;
  petId: string | null;
  pacienteNombre: string;
  profesionalId: string | null;
  profesionalNombre: string;
};

type FilaAgenda = {
  id: string;
  starts_at: string;
  duration_min: number;
  reason: string;
  status: string;
  pet_id: string | null;
  professional_id: string | null;
  pet_name: string | null;
  professional_name: string | null;
};

type FilaTurno = FilaAgenda & { internal_notes: string | null };

/** Turnos de la institución con el nombre del paciente y del profesional. */
function agenda(where: SQL) {
  return query<FilaTurno>(
    getDb(),
    sql`select a.id, a.starts_at::text, a.duration_min, a.reason, a.internal_notes,
               a.status, a.pet_id, a.professional_id, pt.name as pet_name,
               trim(p.first_name || ' ' || p.last_name) as professional_name
          from appointments a
          left join pets pt on pt.id = a.pet_id
          left join vet_professionals vp on vp.id = a.professional_id
          left join profiles p on p.id = vp.profile_id
         where ${where}
         order by a.starts_at`,
  );
}

function toAppointmentListItem(fila: FilaAgenda): AppointmentListItem {
  return {
    id: fila.id,
    startsAt: fila.starts_at,
    duracionMin: fila.duration_min,
    motivo: fila.reason,
    estado: fila.status as AppointmentStatus,
    petId: fila.pet_id,
    pacienteNombre: fila.pet_name ?? "Paciente eliminado",
    profesionalId: fila.professional_id,
    profesionalNombre: fila.professional_id
      ? (fila.professional_name ?? "")
      : "Sin profesional asignado",
  };
}

export type AgendaRango = {
  /** ISO. Inclusive. */
  desde?: string;
  /** ISO. Inclusive. */
  hasta?: string;
};

/**
 * La agenda de la institución, ordenada por fecha. `desde`/`hasta` filtran
 * por `starts_at`; sin ninguno de los dos, devuelve toda la agenda (pasada y
 * futura) de la institución.
 */
export async function getAgenda(
  rango: AgendaRango = {},
): Promise<AppointmentListItem[]> {
  const vet = await requirePremiumVet();

  const desde = rango.desde ? sql` and a.starts_at >= ${rango.desde}` : sql``;
  const hasta = rango.hasta ? sql` and a.starts_at <= ${rango.hasta}` : sql``;

  const filas = await agenda(
    sql`a.institution_id = ${vet.institucionId}${desde}${hasta}`,
  );

  return filas.map(toAppointmentListItem);
}

/**
 * Los turnos de una mascota para un día, para ofrecerlos al registrar la
 * llegada (migración 059). Solo los que todavía esperan algo: un turno
 * cancelado o ya atendido no es candidato a vincularse a una visita nueva.
 *
 * Es la única lectura de este archivo que NO llama a `requirePremiumVet()`, y
 * es a propósito. La llama el mostrador, que existe con Premium y sin Premium;
 * si el gate estuviera acá, registrar una llegada en una clínica free tiraría
 * una excepción en vez de mostrar un selector vacío. El gate real sigue siendo
 * la política de SELECT de `appointments`, que para una clínica sin Premium
 * devuelve cero filas — que es exactamente lo correcto: sin agenda no hay
 * turnos que ofrecer.
 */
export async function getPetAppointmentsForDay(
  petId: string,
  fecha?: string,
): Promise<AppointmentListItem[]> {
  const vet = await requireVet();

  const dia = fecha ?? hoyArgentina();
  const { inicio, fin } = limitesDiaArgentina(dia);

  const filas = await agenda(
    sql`a.institution_id = ${vet.institucionId} and a.pet_id = ${petId}
        and a.status in ('scheduled', 'confirmed')
        and a.starts_at >= ${inicio} and a.starts_at < ${fin}`,
  ).catch(() => []);

  return filas.map(toAppointmentListItem);
}
