import "server-only";

import { sql } from "drizzle-orm";

import { toTeamMember } from "@/features/erp/lib/team-mappers";
import { requireErp } from "@/features/erp/lib/erp-session";
import { getDb, query } from "@/lib/db";
import type { TeamMember } from "@/types/erp";

/** El equipo de la institución con los módulos del ERP que tiene habilitados. */
export async function listTeamMembers(): Promise<TeamMember[]> {
  const vet = await requireErp();

  const filas = await query<{
    id: string;
    role_in_institution: string;
    first_name: string | null;
    last_name: string | null;
    modulos: string[];
  }>(
    getDb(),
    sql`select vp.id, vp.role_in_institution, p.first_name, p.last_name,
               coalesce((select array_agg(g.module::text) from erp.module_grants g
                  where g.professional_id = vp.id
                    and g.institution_id = ${vet.institucionId}
                    and g.revoked_at is null), '{}') as modulos
          from vet_professionals vp
          left join profiles p on p.id = vp.profile_id
         where vp.institution_id = ${vet.institucionId}
         order by vp.id`,
  ).catch((error) => {
    console.error("listTeamMembers", error);
    return [];
  });

  return filas.map((fila) =>
    toTeamMember(
      {
        id: fila.id,
        role_in_institution: fila.role_in_institution,
        profiles: { first_name: fila.first_name, last_name: fila.last_name },
      },
      fila.modulos,
    ),
  );
}
