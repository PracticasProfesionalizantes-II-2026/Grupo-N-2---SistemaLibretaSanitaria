import { Users } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  VisitPriorityChip,
  VisitStatusChip,
} from "@/components/ui/status-chip";
import { VET_BASE } from "@/config/vet-nav";
import { formatLongDate } from "@/lib/format";
import type { VetVisit } from "@/features/vet/lib/mappers";

export function PatientVisits({
  visits,
  patientName,
}: {
  visits: VetVisit[];
  patientName: string;
}) {
  if (visits.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin atenciones registradas"
        description={`${patientName} todavía no pasó por la sala de espera de esta veterinaria.`}
        action={
          <ButtonLink href={`${VET_BASE}/sala-de-espera`}>
            Registrar llegada
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {visits.map((visit) => (
        <li key={visit.id}>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-foreground font-semibold">
                  {visit.motivo}
                </h3>
                <VisitPriorityChip priority={visit.prioridad} />
              </div>
              <VisitStatusChip status={visit.estado} />
            </div>

            <p className="text-muted-foreground mt-1 text-sm">
              {formatLongDate(visit.fecha)} · llegó {visit.horaLlegada}
              {visit.horaAtencion ? ` · atendida ${visit.horaAtencion}` : ""}
              {visit.horaSalida ? ` · salió ${visit.horaSalida}` : ""}
            </p>

            {visit.resumen ? (
              <p className="text-foreground mt-3 text-sm">{visit.resumen}</p>
            ) : null}

            {/*
              La veterinaria, no el profesional: la ficha muestra las visitas de
              todas las instituciones, así que lo que hace falta saber es dónde
              la atendieron. Quién la atendió figura en la consulta firmada.
            */}
            {visit.veterinaria ? (
              <p className="text-muted-foreground mt-3 text-xs">
                {visit.veterinaria}
              </p>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
