import {
  DELEGABLE_MODULES,
  type DelegableModule,
  type TeamMember,
} from "@/types/erp";

/**
 * De fila de base a modelo de vista, módulo de Equipo (migración 111).
 *
 * Vive en `lib/` y no en `data/`, mismo criterio que `customer-mappers.ts`:
 * no toca la base, así que un test puede importarlo sin levantar
 * `server-only`.
 */

export type TeamMemberSourceRow = {
  id: string;
  role_in_institution: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

/**
 * Filtra a los módulos delegables conocidos: una fila de `module_grants` con
 * un `module` que no está en `DELEGABLE_MODULES` (por ejemplo `stock` o
 * `ventas`, que nunca deberían aparecer ahí otorgados, o un valor futuro que
 * el CHECK de la base ya conoce y este archivo todavía no) se ignora en vez
 * de reventar la pantalla entera de Equipo.
 */
function esDelegable(modulo: string): modulo is DelegableModule {
  return (DELEGABLE_MODULES as readonly string[]).includes(modulo);
}

export function toTeamMember(
  fila: TeamMemberSourceRow,
  modulosVigentes: string[],
): TeamMember {
  const nombre = [fila.profiles?.first_name, fila.profiles?.last_name]
    .filter(Boolean)
    .join(" ");

  return {
    profesionalId: fila.id,
    nombre: nombre || "—",
    rolEnInstitucion: fila.role_in_institution,
    esTitular: fila.role_in_institution === "owner",
    modulosOtorgados: modulosVigentes.filter(esDelegable),
  };
}
