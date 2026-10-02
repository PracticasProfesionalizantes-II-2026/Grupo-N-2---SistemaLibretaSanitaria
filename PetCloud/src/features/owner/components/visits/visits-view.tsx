"use client";

import { Clock, Stethoscope } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  VisitPriorityChip,
  VisitStatusChip,
} from "@/components/ui/status-chip";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { detalleMascota } from "@/features/owner/lib/pet-label";
import type { Visit } from "@/types/visit";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Historial de atenciones.
 *
 * Es de solo lectura a propósito: el dueño no reserva ni cancela nada porque la
 * veterinaria atiende por orden de llegada. Lo que sí necesita es saber qué le
 * hicieron a su mascota y cuándo.
 */
export function VisitsView({ visits }: { visits: Visit[] }) {
  const { pets } = useActivePet();
  const [petFilter, setPetFilter] = useState<string>("todas");

  const petName = (petId: string) =>
    pets.find((pet) => pet.id === petId)?.nombre ?? "Mascota";

  const list = visits
    .filter((visit) => petFilter === "todas" || visit.petId === petFilter)
    .sort((a, b) =>
      `${b.fecha} ${b.horaLlegada}`.localeCompare(
        `${a.fecha} ${a.horaLlegada}`,
      ),
    );

  const open = list.filter(
    (visit) => visit.estado === "en-espera" || visit.estado === "en-atencion",
  );

  return (
    <div>
      <PageHeader
        title="Visitas"
        description="Todo lo que le hicieron a tus mascotas, cargado por la veterinaria."
      />

      {open.length > 0 ? (
        <Alert variant="info" className="mb-5">
          {open.length === 1
            ? `${petName(open[0].petId)} está en ${open[0].veterinaria} ahora mismo.`
            : `Tenés ${open.length} mascotas en atención en este momento.`}{" "}
          Las veterinarias atienden por orden de llegada: no hace falta pedir
          turno.
        </Alert>
      ) : null}

      <div className="border-border bg-card mb-5 inline-flex flex-wrap rounded-lg border p-1">
        <button
          type="button"
          onClick={() => setPetFilter("todas")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            petFilter === "todas"
              ? "bg-brand-600 text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Todas
        </button>
        {/* Foto, especie y edad: con dos mascotas del mismo nombre, el nombre
            solo no dice cuál es cuál. */}
        {pets.map((pet) => (
          <button
            key={pet.id}
            type="button"
            onClick={() => setPetFilter(pet.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1 text-left text-sm font-medium",
              petFilter === pet.id
                ? "bg-brand-600 text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Avatar name={pet.nombre} src={pet.fotoUrl} size="sm" />
            <span>
              <span className="block leading-tight">{pet.nombre}</span>
              <span className="block text-xs leading-tight font-normal opacity-80">
                {detalleMascota(pet)}
              </span>
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="Sin visitas registradas"
          description="Cuando lleves a tu mascota a una veterinaria adherida, la atención va a aparecer acá."
        />
      ) : (
        <ul className="space-y-3">
          {list.map((visit) => (
            <li key={visit.id}>
              <Card className="flex flex-col gap-4 p-5 sm:flex-row">
                <Avatar name={petName(visit.petId)} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-foreground font-semibold">
                      {visit.motivo}
                    </h2>
                    <VisitStatusChip status={visit.estado} />
                    <VisitPriorityChip priority={visit.prioridad} />
                  </div>

                  <p className="text-muted-foreground mt-1 text-sm">
                    {petName(visit.petId)} · {formatLongDate(visit.fecha)} ·{" "}
                    {visit.veterinaria}
                  </p>

                  <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                    <Clock className="size-3.5" />
                    Llegada {visit.horaLlegada}
                    {visit.horaAtencion
                      ? ` · atención ${visit.horaAtencion}`
                      : ""}
                    {visit.horaSalida ? ` · salida ${visit.horaSalida}` : ""}
                  </p>

                  {visit.resumen ? (
                    <p className="text-foreground border-border mt-3 border-t pt-3 text-sm">
                      {visit.resumen}
                    </p>
                  ) : visit.estado === "retirada" ? (
                    <p className="text-muted-foreground mt-3 text-sm">
                      Se registró la llegada pero la mascota no llegó a ser
                      atendida.
                    </p>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
