import { Globe, Phone, Stethoscope } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { VetDirectoryEntry } from "@/features/owner/data/vet-directory";
import { VetLocationToggle } from "@/features/owner/components/vet-directory/vet-location-toggle";

/**
 * Directorio de veterinarias cercanas.
 *
 * Tres estados de vacío, con copy distinto para cada uno — un vacío
 * silencioso se lee como "no hay veterinarias", que acá casi siempre es
 * falso: lo más probable es que falte el municipio en el perfil, o que
 * todavía no haya clínicas validadas con coordenadas cargadas cerca.
 *
 * **Nunca se muestra**: matrícula, firma, teléfono personal ni email de
 * ningún profesional. Solo su nombre para mostrar, cuando la lista de
 * guardia viene no vacía.
 */
export function VetDirectoryView({
  clinicas,
}: {
  clinicas: VetDirectoryEntry[];
}) {
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Veterinarias"
        description="Clínicas validadas por PetCloud."
      />

      {clinicas.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="Todavía no hay veterinarias validadas"
          description="PetCloud todavía no validó ninguna clínica."
        />
      ) : (
        <>
          <ul className="space-y-4">
            {clinicas.map((clinica) => (
              <li key={clinica.id}>
                <VetDirectoryRow clinica={clinica} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function VetDirectoryRow({ clinica }: { clinica: VetDirectoryEntry }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {clinica.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo externo, tamaño chico, sin necesidad del optimizador
            <img
              src={clinica.logoUrl}
              alt=""
              className="border-border size-12 shrink-0 rounded-lg border object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground text-lg font-bold">
                {clinica.nombre}
              </span>
              {/*
                Dos fuentes: el interruptor de cada profesional ("ahora") y
                los días programados de la clínica ("hoy"). Con cualquiera
                de las dos la clínica figura de guardia.
              */}
              {clinica.deGuardia ? (
                <Badge variant="success">De guardia ahora</Badge>
              ) : clinica.guardiaProgramadaHoy ? (
                <Badge variant="success">De guardia hoy</Badge>
              ) : null}
              {clinica.resumenGuardiaProgramada ? (
                <span className="text-muted-foreground text-sm">
                  {clinica.deGuardia || clinica.guardiaProgramadaHoy
                    ? "· "
                    : null}
                  {clinica.resumenGuardiaProgramada}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {clinica.direccion}
            </p>
          </div>
        </div>
      </div>

      <dl className="text-muted-foreground mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {clinica.telefono ? (
          <div className="flex items-center gap-2">
            <Phone className="size-4 shrink-0" />
            <dd>{clinica.telefono}</dd>
          </div>
        ) : null}
        {clinica.web ? (
          <div className="flex items-center gap-2">
            <Globe className="size-4 shrink-0" />
            <dd>{clinica.web}</dd>
          </div>
        ) : null}
      </dl>

      {/*
        El array puede venir vacío aun con `deGuardia = true` (la lectura de
        `profiles` bajo RLS es más angosta que la de `vet_professionals`).
        No se interpreta el vacío como "sin guardia": el badge de arriba ya
        vino del booleano, esto solo agrega nombres cuando los hay.
      */}
      {clinica.deGuardia && clinica.profesionalesDeGuardia.length > 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">
          De guardia: {clinica.profesionalesDeGuardia.join(", ")}
        </p>
      ) : null}

      <VetLocationToggle
        lat={clinica.latitud}
        lng={clinica.longitud}
        direccion={clinica.direccion}
        nombre={clinica.nombre}
      />
    </Card>
  );
}
