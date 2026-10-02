"use client";

import {
  Clock,
  LogOut,
  Play,
  QrCode as QrCodeIcon,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  VisitPriorityChip,
  VisitStatusChip,
} from "@/components/ui/status-chip";
import { VET_BASE } from "@/config/vet-nav";
import {
  checkIn as checkInAction,
  closeVisit,
  markNoShow,
  startAttending,
} from "@/features/vet/actions/waiting-room-actions";
import {
  issueWaitingRoomQrSession,
  revokeWaitingRoomQrSession,
  type WaitingRoomQrSession,
} from "@/features/vet/actions/waiting-room-qr-actions";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import { CheckInModal } from "@/features/vet/components/waiting-room/check-in-modal";
import { CloseVisitModal } from "@/features/vet/components/waiting-room/close-visit-modal";
import { WaitingRoomQrCard } from "@/features/vet/components/waiting-room/waiting-room-qr-card";
import type { VetVisit } from "@/features/vet/lib/mappers";
import { WAITING_ROOM_POLL_MS } from "@/features/vet/lib/waiting-room-polling";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VisitPriority } from "@/types/visit";
import { horaArgentina, hoyArgentina } from "@/lib/argentina-time";

/** La hora real: la cola es de hoy y las llegadas son ahora. */
const horaActual = () => horaArgentina(new Date());

const minutes = (time: string) => {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
};

export function WaitingRoomView({
  queue,
  initialQrSession,
  siteUrl,
}: {
  queue: VetVisit[];
  /** La sesión viva de la sala de espera, resuelta en el servidor (o `null` si no se emitió ninguna). */
  initialQrSession: WaitingRoomQrSession | null;
  /** Para armar la URL pública del QR (`{siteUrl}/visitas/ingreso/{code}`). */
  siteUrl: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const vet = useVetSession();

  // Se entra desde la ficha con `?paciente=`: la mascota ya viene identificada.
  const preselectedId = searchParams.get("paciente");
  const [checkingIn, setCheckingIn] = useState(Boolean(preselectedId));
  const [closing, setClosing] = useState<VetVisit | null>(null);

  const [qrSession, setQrSession] = useState(initialQrSession);
  const [emitiendoQr, setEmitiendoQr] = useState(false);
  const [revocandoQr, setRevocandoQr] = useState(false);

  /**
   * Refresco automático: sin esto, un self check-in no aparece en esta
   * pantalla hasta que alguien navegue y vuelva (Req. 12).
   *
   * La pestaña en background no dispara `router.refresh()` — no tiene
   * sentido gastar un viaje al servidor por una pantalla que nadie está
   * mirando, y los navegadores ya frenan los timers en segundo plano de
   * cualquier forma. El listener de `visibilitychange` compensa eso: al
   * volver a la pestaña, refresca una vez enseguida en lugar de esperar
   * hasta el próximo tick de `WAITING_ROOM_POLL_MS`, así la cola nunca queda
   * vieja en el momento exacto en que alguien la mira.
   */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, WAITING_ROOM_POLL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  async function emitirQr() {
    setEmitiendoQr(true);
    const resultado = await issueWaitingRoomQrSession();
    setEmitiendoQr(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }

    setQrSession(resultado.session);
    toast.success("Se emitió un QR nuevo. El anterior dejó de funcionar.");
  }

  async function revocarQr(sessionId: string) {
    setRevocandoQr(true);
    const resultado = await revokeWaitingRoomQrSession(sessionId);
    setRevocandoQr(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }

    setQrSession(null);
    toast.success("Se revocó el QR de la sala de espera.");
  }

  const waiting = queue.filter((visit) => visit.estado === "en-espera");
  const inProgress = queue.filter((visit) => visit.estado === "en-atencion");
  const done = queue.filter(
    (visit) => visit.estado === "atendida" || visit.estado === "retirada",
  );

  /**
   * Cada cambio de estado va a la base y después se refresca.
   *
   * No se toca una copia local de la cola: en el mostrador hay más de una
   * persona mirando la misma pantalla, y una cola que solo se actualiza en la
   * computadora que hizo el clic haría que dos profesionales llamen al mismo
   * paciente.
   */
  async function callNext(visit: VetVisit) {
    const result = await startAttending(visit.id);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`${visit.petNombre} pasó a atención.`);
    router.refresh();
  }

  async function checkIn(data: {
    petId: string;
    motivo: string;
    prioridad: VisitPriority;
    appointmentId?: string;
  }) {
    const result = await checkInAction(data.petId, {
      motivo: data.motivo,
      urgente: data.prioridad === "urgencia",
      appointmentId: data.appointmentId,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Llegada registrada.");
    router.refresh();
  }

  async function cerrar(visit: VetVisit, resumen?: string) {
    const result = await closeVisit(visit.id, { resumen });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Se cerró la atención de ${visit.petNombre}.`);
    router.refresh();
  }

  async function noVino(visit: VetVisit) {
    const result = await markNoShow(visit.id);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`${visit.petNombre} figura como retirada.`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Sala de espera"
        description={`${vet?.institucion.nombre} · ${formatLongDate(hoyArgentina())} · atención por orden de llegada`}
        breadcrumbs={[
          { label: "Gestión", href: `${VET_BASE}/gestion` },
          { label: "Sala de espera" },
        ]}
        actions={
          <Button onClick={() => setCheckingIn(true)}>
            <UserPlus className="size-4" />
            Registrar llegada
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <Card className="px-4 py-3">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              En espera
            </p>
            <p className="text-foreground mt-1 text-2xl font-bold">
              {waiting.length}
            </p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              En atención
            </p>
            <p className="text-foreground mt-1 text-2xl font-bold">
              {inProgress.length}
            </p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              Cerradas hoy
            </p>
            <p className="text-foreground mt-1 text-2xl font-bold">
              {done.length}
            </p>
          </Card>
        </div>

        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-semibold uppercase">
            Atiende
          </p>
          {/* Quien atiende es quien tiene la sesión abierta: el registro lleva
              su matrícula, así que elegir a otro profesional desde acá firmaría
              a su nombre sin que se entere. */}
          <p className="text-foreground text-sm font-medium">
            {[vet?.usuario.nombre, vet?.usuario.apellido]
              .filter(Boolean)
              .join(" ")}
          </p>
          <p className="text-muted-foreground text-xs">{vet?.matricula}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <QueueSection
            title="En atención"
            empty="Nadie está siendo atendido en este momento."
            visits={inProgress}
            renderActions={(visit) => (
              <>
                <ButtonLink
                  href={`${VET_BASE}/pacientes/${visit.petId}/consulta?visita=${visit.id}`}
                  variant="outline"
                  size="sm"
                >
                  <Stethoscope className="size-4" />
                  Cargar consulta
                </ButtonLink>
                <Button size="sm" onClick={() => setClosing(visit)}>
                  Cerrar atención
                </Button>
              </>
            )}
          />

          <QueueSection
            title={`En espera (${waiting.length})`}
            empty="La sala está vacía."
            visits={waiting}
            showWait
            renderActions={(visit) => (
              <>
                <Button size="sm" onClick={() => callNext(visit)}>
                  <Play className="size-4" />
                  Atender
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => noVino(visit)}
                >
                  <LogOut className="size-4" />
                  Se retiró
                </Button>
              </>
            )}
          />

          <QueueSection
            title="Cerradas hoy"
            empty="Todavía no se cerró ninguna atención."
            visits={done}
            renderActions={() => null}
          />
        </div>

        <WaitingRoomQrCard
          session={qrSession}
          siteUrl={siteUrl}
          emitiendo={emitiendoQr}
          revocando={revocandoQr}
          onEmit={emitirQr}
          onRevoke={revocarQr}
        />
      </div>

      <CheckInModal
        open={checkingIn}
        onClose={() => setCheckingIn(false)}
        onCheckIn={checkIn}
        horaActual={horaActual()}
        defaultPatientId={preselectedId}
      />

      {/* `key` remonta el modal por visita para que arranque con su resumen. */}
      <CloseVisitModal
        key={closing?.id}
        visit={closing}
        onClose={() => setClosing(null)}
        onConfirm={(id, resumen) => {
          const visita = queue.find((v) => v.id === id);
          if (visita) cerrar(visita, resumen);
        }}
      />
    </div>
  );
}

function QueueSection({
  title,
  empty,
  visits,
  showWait = false,
  renderActions,
}: {
  title: string;
  empty: string;
  visits: VetVisit[];
  showWait?: boolean;
  renderActions: (visit: VetVisit) => React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-foreground mb-3 font-semibold">{title}</h2>

      {visits.length === 0 ? (
        <EmptyState icon={Users} title={empty} />
      ) : (
        <ul className="space-y-3">
          {visits.map((visit, index) => {
            const espera = minutes(horaActual()) - minutes(visit.horaLlegada);

            return (
              <li
                key={visit.id}
                className={cn(
                  "border-border bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center",
                  visit.prioridad === "urgencia" &&
                    visit.estado === "en-espera" &&
                    "border-danger/40 bg-danger-soft",
                )}
              >
                {showWait ? (
                  <span className="text-muted-foreground w-6 shrink-0 text-lg font-bold tabular-nums">
                    {index + 1}
                  </span>
                ) : null}

                <Avatar name={visit.petNombre ?? "Paciente"} size="md" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`${VET_BASE}/pacientes/${visit.petId}`}
                      className="text-foreground hover:text-brand-700 font-medium"
                    >
                      {visit.petNombre ?? "Paciente"}
                    </Link>
                    <VisitPriorityChip priority={visit.prioridad} />
                    {visit.autogestionado ? (
                      <Badge
                        variant="neutral"
                        title="Nadie del equipo la vio llegar: se anotó sola desde su celular con el QR de la sala de espera."
                      >
                        <QrCodeIcon className="size-3" />
                        Autogestión
                      </Badge>
                    ) : null}
                    {showWait ? null : (
                      <VisitStatusChip status={visit.estado} />
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate text-sm">
                    {visit.motivo}
                  </p>
                  {/* La llegada ya está a la derecha, junto a la espera. */}
                  {visit.horaAtencion ? (
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      Pasó {visit.horaAtencion}
                    </p>
                  ) : null}
                  {visit.resumen ? (
                    <p className="text-foreground mt-1.5 text-sm">
                      {visit.resumen}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Clock className="size-3.5" />
                    Llegó {visit.horaLlegada}
                    {showWait ? ` · espera ${espera} min` : ""}
                  </span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {renderActions(visit)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
