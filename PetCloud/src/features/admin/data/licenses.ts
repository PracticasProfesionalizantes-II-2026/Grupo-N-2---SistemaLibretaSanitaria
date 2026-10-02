import "server-only";

import { sql } from "drizzle-orm";

import { requireAdmin } from "@/features/admin/lib/admin-session";
import {
  nombreCompleto,
  nombreVisible,
} from "@/features/admin/lib/display-name";
import { getDb, query } from "@/lib/db";

/** Solicitudes de matrícula profesional (`/admin/validaciones`). */
export type LicenseRequest = {
  professionalId: string;
  profileId: string;
  nombre: string;
  email: string;
  matricula: string;
  institucionNombre: string;
  validada: boolean;
  /** `null` mientras nadie la haya resuelto. Es lo que separa pendiente de rechazada. */
  revisadaEl: string | null;
  ultimaNota: string | null;
  /** `YYYY-MM-DD`, que es lo que espera `formatLongDate()`. */
  solicitadaEl: string;
  solicitadaAt: string;
};

type Fila = {
  id: string;
  profile_id: string;
  license_number: string;
  license_validated: boolean;
  license_reviewed_at: string | null;
  created_at: string;
  institution_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  last_note: string | null;
};

/** Pendientes primero; dentro de cada grupo, las más viejas arriba. */
export async function listLicenseRequests(): Promise<LicenseRequest[]> {
  await requireAdmin();

  const filas = await query<Fila>(
    getDb(),
    sql`select vp.id, vp.profile_id, vp.license_number, vp.license_validated,
               vp.license_reviewed_at::text, vp.created_at::text,
               vi.name as institution_name, p.first_name, p.last_name, u.email,
               (select r.note from vet_license_reviews r
                 where r.professional_id = vp.id
                 order by r.occurred_at desc limit 1) as last_note
          from vet_professionals vp
          left join vet_institutions vi on vi.id = vp.institution_id
          left join profiles p on p.id = vp.profile_id
          left join auth.users u on u.id = vp.profile_id
         where vp.removed_at is null
         order by (vp.license_reviewed_at is not null), vp.created_at`,
  );

  return filas.map((fila) => ({
    professionalId: fila.id,
    profileId: fila.profile_id,
    nombre: nombreVisible(
      nombreCompleto(fila.first_name, fila.last_name),
      fila.email ?? undefined,
    ),
    email: fila.email ?? "—",
    matricula: fila.license_number,
    institucionNombre: fila.institution_name ?? "Sin veterinaria",
    validada: fila.license_validated,
    revisadaEl: fila.license_reviewed_at,
    ultimaNota: fila.last_note,
    solicitadaEl: fila.created_at.slice(0, 10),
    solicitadaAt: fila.created_at,
  }));
}
