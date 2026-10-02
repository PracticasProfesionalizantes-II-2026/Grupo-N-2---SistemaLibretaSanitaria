"use client";

import { CalendarClock, CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AppointmentStatusChip } from "@/components/ui/status-chip";
import { VET_BASE } from "@/config/vet-nav";
import {
  cancelAppointment,
  createAppointment,
  markAppointmentStatus,
  rescheduleAppointment,
  type AppointmentTrackingStatus,
} from "@/features/vet/actions/appointment-actions";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import {
  NuevoTurnoModal,
  type NuevoTurnoData,
} from "@/features/vet/components/turnos/nuevo-turno-modal";
import {
  ReprogramarTurnoModal,
  type ReprogramarData,
} from "@/features/vet/components/turnos/reprogramar-turno-modal";
import type { AppointmentListItem } from "@/features/vet/data/appointments";
import { hoyArgentina, horaArgentina } from "@/lib/argentina-time";
import { formatLongDate } from "@/lib/format";
import type { Professional } from "@/types/vet";

export type GrupoAgenda = { fecha: string; turnos: AppointmentListItem[] };

/**
 * Agrupa la agenda por día calendario en **America/Argentina/Buenos_Aires**,
 * no por el día calendario del runtime que ejecuta el código: un turno a las
 * 23:30 (Argentina) tiene que aparecer bajo su propio día, no bajo el
 * siguiente. `getFullYear()`/`getMonth()`/`getDate()` sin `Intl.DateTimeFormat`
 * de por medio usan la zona horaria del SISTEMA donde corre Node (en producción o
 * en el runner de CI eso suele ser UTC, no Argentina) — exactamente el bug
 * que este comentario decía evitar en la versión anterior, y que reventó en
 * CI (donde el sistema sí está en UTC) aunque pasara en una máquina cuyo
 * reloj ya estuviera en horario argentino. Por eso la conversión se hace
 * siempre explícita, sin depender de dónde corra el proceso.
 *
 * Dentro de cada grupo conserva el orden ascendente por horario que ya trae
 * `getAgenda()`; los grupos salen ordenados por fecha.
 *
 * Función pura y exportada a propósito: es la única lógica de esta pantalla
 * que vale la pena probar sin levantar infraestructura de render de
 * componentes (el proyecto no tiene `@testing-library/react` ni un entorno
 * jsdom configurado en Vitest todavía — ver `turnos-view.test.ts`).
 */
export function agruparPorFecha(agenda: AppointmentListItem[]): GrupoAgenda[] {
  const grupos = new Map<string, AppointmentListItem[]>();
  for (const turno of agenda) {
    const clave = hoyArgentina(turno.startsAt);

    const existentes = grupos.get(clave);
    if (existentes) {
      existentes.push(turno);
    } else {
      grupos.set(clave, [turno]);
    }
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, turnos]) => ({ fecha, turnos }));
}

/**
 * Agenda de turnos de la institución.
 *
 * Cualquier profesional gestiona turnos mientras la institución sea Premium
 * (spec "Any professional can manage appointments while premium"): a
 * diferencia de `/veterinaria/premium`, acá no hay ningún control que se
 * oculte según `rolEnInstitucion`.
 */
export function TurnosView({
  agenda,
  equipo,
}: {
  agenda: AppointmentListItem[];
  equipo: Professional[];
}) {
  const router = useRouter();
  const vet = useVetSession();
  const [creando, setCreando] = useState(false);
  const [reprogramando, setReprogramando] =
    useState<AppointmentListItem | null>(null);

  const grupos = agruparPorFecha(agenda);

  async function crear(data: NuevoTurnoData): Promise<boolean> {
    const result = await createAppointment(data);

    if (!result.success) {
      toast.error(result.error);
      return false;
    }

    toast.success("Turno agendado. El dueño ya fue notificado.");
    router.refresh();
    return true;
  }

  async function reprogramar(
    turno: AppointmentListItem,
    data: ReprogramarData,
  ): Promise<boolean> {
    const result = await rescheduleAppointment(turno.id, data);

    if (!result.success) {
      toast.error(result.error);
      return false;
    }

    toast.success(`Turno de ${turno.pacienteNombre} reprogramado.`);
    router.refresh();
    return true;
  }

  async function cancelar(turno: AppointmentListItem) {
    const result = await cancelAppointment(turno.id);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Turno de ${turno.pacienteNombre} cancelado.`);
    router.refresh();
  }

  async function marcarEstado(
    turno: AppointmentListItem,
    estado: AppointmentTrackingStatus,
  ) {
    const result = await markAppointmentStatus(turno.id, estado);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`${turno.pacienteNombre}: turno actualizado.`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Turnos"
        description={
          vet ? `${vet.institucion.nombre} · agenda de la institución` : ""
        }
        breadcrumbs={[
          { label: "Gestión", href: `${VET_BASE}/gestion` },
          { label: "Turnos" },
        ]}
        actions={
          <Button onClick={() => setCreando(true)}>
            <CalendarPlus className="size-4" />
            Agendar turno
          </Button>
        }
      />

      {grupos.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Todavía no hay turnos agendados."
          description="Agendá el primero con “Agendar turno”."
        />
      ) : (
        <div className="space-y-8">
          {grupos.map((grupo) => (
            <section key={grupo.fecha}>
              <h2 className="text-foreground mb-3 font-semibold">
                {formatLongDate(grupo.fecha)}
              </h2>

              <ul className="space-y-3">
                {grupo.turnos.map((turno) => (
                  <li
                    key={turno.id}
                    className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-foreground font-medium">
                          {turno.pacienteNombre}
                        </span>
                        <AppointmentStatusChip status={turno.estado} />
                      </div>
                      <p className="text-muted-foreground mt-0.5 truncate text-sm">
                        {turno.motivo}
                      </p>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {horaArgentina(turno.startsAt)} · {turno.duracionMin}{" "}
                        min · {turno.profesionalNombre}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      {turno.estado === "scheduled" ? (
                        <Button
                          size="sm"
                          onClick={() => marcarEstado(turno, "confirmed")}
                        >
                          Confirmar
                        </Button>
                      ) : null}

                      {turno.estado === "confirmed" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => marcarEstado(turno, "attended")}
                          >
                            Atendido
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => marcarEstado(turno, "no_show")}
                          >
                            No vino
                          </Button>
                        </>
                      ) : null}

                      {turno.estado === "scheduled" ||
                      turno.estado === "confirmed" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setReprogramando(turno)}
                          >
                            Reprogramar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onClick={() => cancelar(turno)}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <NuevoTurnoModal
        open={creando}
        onClose={() => setCreando(false)}
        onCrear={crear}
        equipo={equipo}
        profesionalPorDefecto={vet?.profesionalId}
      />

      {/* `key` remonta el modal por turno para arrancar con su propia fecha/hora/duración. */}
      <ReprogramarTurnoModal
        key={reprogramando?.id}
        turno={reprogramando}
        onClose={() => setReprogramando(null)}
        onConfirmar={(data) =>
          reprogramando
            ? reprogramar(reprogramando, data)
            : Promise.resolve(false)
        }
      />
    </div>
  );
}
