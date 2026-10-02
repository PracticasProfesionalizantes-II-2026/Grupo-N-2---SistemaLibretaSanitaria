import { PenLine, Stethoscope } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { VET_BASE } from "@/config/vet-nav";
import { formatLongDate } from "@/lib/format";
import type { Consultation } from "@/types/pet";

export function ClinicalTimeline({
  consultations,
  petId,
}: {
  consultations: Consultation[];
  petId: string;
}) {
  if (consultations.length === 0) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="Sin consultas registradas"
        description="Cuando cargues la primera atención va a aparecer en esta línea de tiempo."
        action={
          <ButtonLink href={`${VET_BASE}/pacientes/${petId}/consulta`}>
            Cargar consulta
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ol className="relative space-y-4 pl-6">
      {/* Línea vertical de la timeline; decorativa, por eso queda fuera del flujo. */}
      <span
        className="bg-border absolute top-2 bottom-2 left-[7px] w-px"
        aria-hidden
      />

      {consultations.map((consultation) => (
        <li key={consultation.id} className="relative">
          <span
            className="bg-brand-600 ring-card absolute top-6 -left-6 size-4 rounded-full ring-4"
            aria-hidden
          />

          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-foreground font-semibold">
                {consultation.tipo}
              </h3>
              <p className="text-muted-foreground text-sm">
                {formatLongDate(consultation.fecha)}
              </p>
            </div>

            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Diagnóstico</dt>
                <dd className="text-foreground font-medium">
                  {consultation.diagnostico}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Observaciones</dt>
                <dd className="text-foreground">
                  {consultation.observaciones}
                </dd>
              </div>
            </dl>

            <p className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
              {consultation.firmaDigital ? (
                <>
                  <PenLine className="size-3.5" />
                  Firmado por {consultation.veterinario}
                </>
              ) : (
                <>Borrador sin firmar — {consultation.veterinario}</>
              )}{" "}
              · {consultation.veterinaria}
            </p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
