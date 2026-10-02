import Link from "next/link";

import { Card } from "@/components/ui/card";
import { VET_BASE } from "@/config/app-routes";
import { TeamView } from "@/features/erp/components/team/team-view";
import type { TeamMember } from "@/types/erp";

/**
 * Delegación de módulos del ERP, embebida en Institución.
 *
 * Tenía ruta propia (`/veterinaria/erp/equipo`) y dejó de tenerla: hablaba de
 * las mismas personas que "Profesionales del equipo" de Institución, así que
 * pasar de "quién trabaja acá" a "qué puede tocar cada uno" obligaba a cruzar
 * el menú entero. Ahora las dos cosas viven en una sola pantalla. Es el mismo
 * movimiento que hizo el catálogo de vacunas al meterse adentro de
 * Vacunaciones (`vaccine-catalog-manager.tsx`): el bloque no trae `PageHeader`
 * propio, lo pone quien lo embebe.
 *
 * `miembros` en `null` significa "la institución no tiene Premium". La
 * distinción se resuelve en el servidor y no acá porque `listTeamMembers()`
 * pasa por `requireErp()`, que redirige sin Premium: pedirlo igual para
 * después descartarlo echaría de Institución a la veterinaria que no paga, que
 * es justo la que más necesita entrar (sus propios datos, invitar
 * profesionales).
 */
export function ModuleGrantsCard({
  miembros,
  esTitular,
}: {
  miembros: TeamMember[] | null;
  esTitular: boolean;
}) {
  return (
    <Card className="p-0">
      <div className="border-border border-b p-5">
        <h2 className="text-foreground font-semibold">
          Acceso a los módulos de administración
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Qué módulos del ERP tiene delegado cada profesional. Solo el titular
          puede otorgar o revocar.
        </p>
      </div>

      <div className="p-5">
        {miembros === null ? (
          // Mismo criterio que las entradas con candado del panel lateral
          // (`vet-nav.tsx`): no se esconde, se explica y se ofrece el alta. Una
          // veterinaria que no ve la función tampoco se entera de que existe
          // algo para comprar.
          <p className="text-muted-foreground text-sm">
            Repartir los módulos de administración entre el equipo es parte de
            Premium. Sin suscripción activa no hay módulos que delegar.{" "}
            <Link
              href={`${VET_BASE}/premium`}
              className="text-brand-700 font-medium hover:underline"
            >
              Conocer Premium
            </Link>
          </p>
        ) : (
          <TeamView miembros={miembros} esTitular={esTitular} />
        )}
      </div>
    </Card>
  );
}
