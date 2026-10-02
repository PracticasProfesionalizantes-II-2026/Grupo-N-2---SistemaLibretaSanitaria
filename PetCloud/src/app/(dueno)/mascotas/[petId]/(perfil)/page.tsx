import {
  AlertTriangle,
  CalendarClock,
  FileClock,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { VisitStatusChip } from "@/components/ui/status-chip";
import {
  ESTADO_TURNO,
  getPetAppointments,
  proximosTurnos,
} from "@/features/owner/data/appointment-queries";
import {
  getPet,
  getReminders,
  getVaccinations,
  getVisits,
} from "@/features/owner/data/pet-queries";
import { listPetAccess } from "@/features/owner/data/owner-queries";
import { PetAccessCard } from "@/features/owner/components/pet-profile/pet-access-card";
import { mostrarSeccionTurnos } from "@/features/owner/lib/appointments-visibility";
import { formatDate } from "@/lib/format";

export default async function PetSummaryPage({
  params,
}: PageProps<"/mascotas/[petId]">) {
  const { petId } = await params;
  const pet = await getPet(petId);
  if (!pet) notFound();

  // Las consultas son independientes: en paralelo tardan lo que la más lenta,
  // en serie lo que la suma.
  const [visits, vaccinations, reminders, appointments, acceso] =
    await Promise.all([
      getVisits(pet.id),
      getVaccinations(pet.id),
      getReminders(pet.id),
      getPetAppointments(pet.id),
      listPetAccess(pet.id),
    ]);

  const lastVisits = visits.slice(0, 3);
  const lastRecords = vaccinations.slice(0, 3);
  const alerts = reminders.filter((r) => r.estado === "vencido");

  // "Próximos" es a futuro y no cancelado; el resto de turnos (pasados,
  // cancelados) vive en el historial de la veterinaria, no en esta tarjeta.
  const upcomingAppointments = proximosTurnos(appointments);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-foreground flex items-center gap-2 font-semibold">
            <Stethoscope className="text-brand-600 size-[18px]" />
            Últimas visitas
          </h2>

          {lastVisits.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">
              {pet.nombre} todavía no fue atendido en una veterinaria adherida.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lastVisits.map((visit) => (
                <li key={visit.id}>
                  <Link
                    href="/visitas"
                    className="hover:bg-muted -mx-2 block rounded-lg px-2 py-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-foreground text-sm font-medium">
                        {visit.motivo}
                      </p>
                      <VisitStatusChip status={visit.estado} />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatDate(visit.fecha)} · {visit.horaLlegada} ·{" "}
                      {visit.veterinaria}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-foreground flex items-center gap-2 font-semibold">
            <FileClock className="text-brand-600 size-[18px]" />
            Últimas cargas
          </h2>

          {lastRecords.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">
              Todavía no hay registros cargados.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lastRecords.map((record) => (
                <li key={record.id}>
                  <Link
                    href={`/mascotas/${pet.id}/vacunas`}
                    className="hover:bg-muted -mx-2 block rounded-lg px-2 py-1.5"
                  >
                    <p className="text-foreground text-sm font-medium">
                      {record.vacuna} · {record.dosis}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatDate(record.fechaAplicacion)} · {record.lugar}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          className={
            alerts.length > 0 ? "border-danger/25 bg-danger-soft p-5" : "p-5"
          }
        >
          <h2
            className={`flex items-center gap-2 font-semibold ${
              alerts.length > 0 ? "text-danger" : "text-foreground"
            }`}
          >
            <AlertTriangle className="size-[18px]" />
            Alertas
          </h2>

          {alerts.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">
              {pet.nombre} no tiene alertas pendientes.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <p className="text-foreground text-sm font-medium">
                    {alert.titulo}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {alert.descripcion}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/*
        Turnos los agenda la veterinaria (módulo Premium); acá el dueño solo
        los ve. No hay acción de reservar/solicitar un turno: eso está fuera
        de alcance (ver spec vet-appointments, "No booking action").
        Sin ningún turno en la historia de la mascota la tarjeta no aparece:
        ver `mostrarSeccionTurnos`.
    */}
      {mostrarSeccionTurnos(appointments) ? (
        <Card className="p-5">
          <h2 className="text-foreground flex items-center gap-2 font-semibold">
            <CalendarClock className="text-brand-600 size-[18px]" />
            Próximos turnos
          </h2>

          {upcomingAppointments.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">
              {pet.nombre} no tiene turnos próximos.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {upcomingAppointments.map((turno) => {
                const { label, variant } = ESTADO_TURNO[turno.estado];
                return (
                  <li
                    key={turno.id}
                    className="border-border rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-foreground text-sm font-medium">
                        {turno.motivo}
                      </p>
                      <Badge variant={variant}>{label}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatDate(turno.fecha)} · {turno.hora} ·{" "}
                      {turno.veterinaria}
                      {turno.profesional ? ` · ${turno.profesional}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      <PetAccessCard acceso={acceso} petName={pet.nombre} />
    </div>
  );
}
