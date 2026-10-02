import { Hourglass, Megaphone, Syringe, Users } from "lucide-react";
import type { Metadata } from "next";

import { VET_BASE } from "@/config/vet-nav";
import { MetricCard } from "@/components/ui/metric-card";
import { ErpUpsellCard } from "@/features/vet/components/dashboard/erp-upsell-card";
import { VetNotices } from "@/features/vet/components/dashboard/vet-notices";
import { VetQuickActions } from "@/features/vet/components/dashboard/vet-quick-actions";
import { WaitingRoomSummary } from "@/features/vet/components/dashboard/waiting-room-summary";
import {
  getDashboardMetrics,
  getVetNotices,
} from "@/features/vet/actions/dashboard-actions";
import { listWaitingRoom } from "@/features/vet/actions/waiting-room-actions";
import { requireVet } from "@/features/vet/lib/vet-session";
import { formatLongDate } from "@/lib/format";
import { hoyArgentina } from "@/lib/argentina-time";

export const metadata: Metadata = { title: "Gestión" };

export default async function VetDashboardPage() {
  const vet = await requireVet();

  const [metrics, queue, notices] = await Promise.all([
    getDashboardMetrics(),
    listWaitingRoom(),
    getVetNotices(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Hola, {vet.usuario.nombre}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {vet.institucion.nombre} · {formatLongDate(hoyArgentina())}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="En sala de espera"
          value={metrics.enEspera}
          hint="Esperando ser atendidas ahora"
          href={`${VET_BASE}/sala-de-espera`}
        />
        <MetricCard
          icon={Hourglass}
          label="Espera promedio"
          value={
            metrics.esperaPromedio === null
              ? "—"
              : `${metrics.esperaPromedio} min`
          }
          hint="Entre la llegada y la atención, hoy"
          href={`${VET_BASE}/sala-de-espera`}
        />
        <MetricCard
          icon={Megaphone}
          label="Atendidas hoy"
          value={metrics.atendidosHoy}
          hint="Atenciones cerradas en el día"
          href={`${VET_BASE}/sala-de-espera`}
        />
        <MetricCard
          icon={Syringe}
          label="Vacunas aplicadas"
          value={metrics.vacunasAplicadas}
          hint="En lo que va del mes"
          href={`${VET_BASE}/vacunaciones`}
        />
      </div>

      {/*
        Va debajo de las métricas y no arriba: el tablero abre con el estado
        de la jornada, que es a lo que se entra. La oferta queda en el primer
        scroll, no tapando el dato por el que se abrió la pantalla.

        El estado Premium se decide en el servidor (`requireVet()` ya trae
        `premium` de `getPremiumState()`, la misma cuenta que usa el gate):
        sin Premium activo la tarjeta ni siquiera se serializa al cliente.
      */}
      {!vet.premium.activo ? (
        <div className="mt-6">
          <ErpUpsellCard soyTitular={vet.rolEnInstitucion === "owner"} />
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <WaitingRoomSummary visits={queue} />
          <VetQuickActions />
        </div>

        <VetNotices notices={notices} />
      </div>
    </div>
  );
}
