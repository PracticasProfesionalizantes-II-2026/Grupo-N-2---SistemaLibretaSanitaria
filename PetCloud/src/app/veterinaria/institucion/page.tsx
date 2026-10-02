import type { Metadata } from "next";

import { ModuleGrantsCard } from "@/features/erp/components/team/module-grants-card";
import { InstitutionView } from "@/features/vet/components/institution/institution-view";
import { listTeam } from "@/features/vet/actions/institution-actions";
import { listOwnerTeamInvites } from "@/features/vet/data/team-invites";
import { listTeamMembers } from "@/features/erp/data/team";
import { requireVet } from "@/features/vet/lib/vet-session";

export const metadata: Metadata = { title: "Institución" };

/**
 * Esta pantalla absorbió la delegación de módulos del ERP, que hasta ahora
 * tenía ruta propia en `/veterinaria/erp/equipo`.
 *
 * El corte por Premium se decide acá, con `vet.premium.activo`, y nunca con
 * `requireErp()`: esa función redirige a la pantalla de alta, y usarla en
 * Institución echaría de su propia ficha a la veterinaria sin suscripción —la
 * misma regresión que `vet-nav.test.ts` fija del lado del menú. Sin Premium el
 * roster del ERP directamente no se pide (`listTeamMembers()` también pasa por
 * `requireErp()`), y la tarjeta muestra el aviso en su lugar.
 */
export default async function InstitutionPage() {
  const vet = await requireVet();
  const soyTitular = vet.rolEnInstitucion === "owner";

  const [equipo, invitaciones, miembrosErp] = await Promise.all([
    listTeam(),
    listOwnerTeamInvites(),
    vet.premium.activo ? listTeamMembers() : null,
  ]);

  return (
    <InstitutionView
      institucion={vet.institucion}
      equipoInicial={equipo}
      invitaciones={invitaciones}
      soyTitular={soyTitular}
      deGuardiaInicial={vet.deGuardia}
      ausenciaInicial={vet.ausencia}
      licenciaValidada={vet.licenciaValidada}
      accesoModulos={
        <ModuleGrantsCard miembros={miembrosErp} esTitular={soyTitular} />
      }
    />
  );
}
