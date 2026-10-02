import { Pill, Stethoscope, Syringe, Users } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { VisitStatusChip } from "@/components/ui/status-chip";
import { VET_BASE } from "@/config/vet-nav";
import { formatDate, formatLongDate } from "@/lib/format";
import type { VetConsultation, VetVisit } from "@/features/vet/lib/mappers";
import type { Medication, Vaccination } from "@/types/pet";

/**
 * Resumen de la ficha: lo que el veterinario necesita ver en los primeros
 * segundos de la consulta, antes de entrar al detalle de cada pestaña.
 */
export function PatientSummary({
  patientId,
  ultimaConsulta: lastConsultation,
  proximaVacuna: nextVaccine,
  medicacionActiva: medications,
  ultimaVisita: lastVisit,
}: {
  patientId: string;
  ultimaConsulta?: VetConsultation;
  proximaVacuna?: Vaccination;
  medicacionActiva: Medication[];
  ultimaVisita?: VetVisit;
}) {
  const base = `${VET_BASE}/pacientes/${patientId}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
          <Stethoscope className="size-4" />
          Última atención
        </h2>

        {lastConsultation ? (
          <>
            <p className="text-foreground mt-3 font-semibold">
              {lastConsultation.tipo}
            </p>
            <p className="text-muted-foreground text-sm">
              {formatLongDate(lastConsultation.fecha)} ·{" "}
              {lastConsultation.veterinario}
            </p>
            <p className="text-foreground mt-3 text-sm">
              {lastConsultation.diagnostico}
            </p>
            <Link
              href={`${base}/historial`}
              className="text-brand-700 mt-4 inline-block text-sm font-medium hover:underline"
            >
              Ver historial completo
            </Link>
          </>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Sin atenciones registradas.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
          <Syringe className="size-4" />
          Plan de vacunación
        </h2>

        {nextVaccine ? (
          <>
            <p className="text-foreground mt-3 font-semibold">
              {nextVaccine.vacuna}
            </p>
            <p className="text-muted-foreground text-sm">
              Próxima dosis: {formatDate(nextVaccine.proximaDosis ?? "")}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Última aplicación el {formatDate(nextVaccine.fechaAplicacion)} en{" "}
              {nextVaccine.lugar}.
            </p>
            <Link
              href={`${base}/vacunas`}
              className="text-brand-700 mt-4 inline-block text-sm font-medium hover:underline"
            >
              Ver todas las vacunas
            </Link>
          </>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Sin vacunas registradas.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
          <Pill className="size-4" />
          Tratamientos en curso
        </h2>

        {medications.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            No tiene medicación activa.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {medications.map((medication) => (
              <li key={medication.id}>
                <p className="text-foreground text-sm font-medium">
                  {medication.medicamento}
                </p>
                <p className="text-muted-foreground text-sm">
                  {medication.dosis} · {medication.frecuencia}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
          <Users className="size-4" />
          Última visita
        </h2>

        {lastVisit ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-foreground font-semibold">
                {formatDate(lastVisit.fecha)} · llegó {lastVisit.horaLlegada}
              </p>
              <VisitStatusChip status={lastVisit.estado} />
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {lastVisit.motivo}
              {lastVisit.veterinaria ? ` · ${lastVisit.veterinaria}` : ""}
            </p>
            <Link
              href={`${base}/visitas`}
              className="text-brand-700 mt-4 inline-block text-sm font-medium hover:underline"
            >
              Ver todas las visitas
            </Link>
          </>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Todavía no pasó por la sala de espera.
          </p>
        )}
      </Card>
    </div>
  );
}
