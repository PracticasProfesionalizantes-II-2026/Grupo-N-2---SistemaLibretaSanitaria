import { Clock, Stethoscope, Users } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  VisitPriorityChip,
  VisitStatusChip,
} from "@/components/ui/status-chip";
import { VET_BASE } from "@/config/vet-nav";
import { cn } from "@/lib/utils";
import type { VetVisit } from "@/features/vet/lib/mappers";

/** Cola del día en el dashboard: solo lectura, las acciones viven en la sala. */
export function WaitingRoomSummary({ visits }: { visits: VetVisit[] }) {
  const waiting = visits.filter((visit) => visit.estado === "en-espera").length;

  return (
    <Card className="p-0">
      <div className="border-border flex items-center justify-between gap-3 border-b p-5">
        <div>
          <h2 className="text-foreground font-semibold">Sala de espera</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {waiting === 0
              ? "Nadie esperando en este momento."
              : `${waiting} mascota${waiting === 1 ? "" : "s"} esperando, por orden de llegada.`}
          </p>
        </div>
        <ButtonLink
          href={`${VET_BASE}/sala-de-espera`}
          variant="outline"
          size="sm"
        >
          Abrir la sala
        </ButtonLink>
      </div>

      {visits.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={Users}
            title="Todavía no llegó nadie hoy"
            description="Registrá la llegada de la primera mascota para armar la cola."
            action={
              <ButtonLink href={`${VET_BASE}/sala-de-espera`} size="sm">
                Registrar llegada
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <ul className="divide-border divide-y">
          {visits.map((visit) => {
            const abierta =
              visit.estado === "en-espera" || visit.estado === "en-atencion";

            return (
              <li
                key={visit.id}
                className={cn(
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-center",
                  visit.prioridad === "urgencia" &&
                    visit.estado === "en-espera" &&
                    "bg-danger-soft",
                )}
              >
                <span className="text-muted-foreground w-14 shrink-0 text-sm font-semibold tabular-nums">
                  {visit.horaLlegada}
                </span>

                <Avatar name={visit.petNombre} size="md" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`${VET_BASE}/pacientes/${visit.petId}`}
                      className="text-foreground hover:text-brand-700 truncate text-sm font-medium"
                    >
                      {visit.petNombre}
                    </Link>
                    <VisitPriorityChip priority={visit.prioridad} />
                  </div>
                  <p className="text-muted-foreground truncate text-sm">
                    {visit.duenoNombre ? `${visit.duenoNombre} · ` : ""}
                    {visit.motivo}
                  </p>
                  {visit.horaAtencion ? (
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      <Clock className="mr-1 inline size-3" />
                      Atendida {visit.horaAtencion}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <VisitStatusChip status={visit.estado} />
                  {abierta ? (
                    <ButtonLink
                      href={`${VET_BASE}/sala-de-espera`}
                      size="sm"
                      variant={
                        visit.estado === "en-atencion" ? "primary" : "secondary"
                      }
                    >
                      <Stethoscope className="size-4" />
                      Atender
                    </ButtonLink>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
