import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ESTADO_TURNO,
  type OwnerAppointment,
} from "@/features/owner/data/appointment-queries";
import { formatDate } from "@/lib/format";

/**
 * Los próximos turnos, arriba de todo en el inicio.
 *
 * Hasta acá los turnos vivían a tres niveles de profundidad —entrar al perfil
 * de la mascota, bajar hasta la última tarjeta— y eso es demasiado lejos para
 * el dato que hace que alguien no falte a una cita.
 *
 * **No se renderiza si no hay turnos.** Una tarjeta vacía que dice "no tenés
 * turnos" arriba de todo le come el lugar a lo que sí importa y, peor, le
 * enseña al ojo a saltearse esa zona de la pantalla — con lo cual el día que
 * haya un turno, tampoco se ve. El vacío se muestra donde se lo va a buscar a
 * propósito (el perfil de la mascota y Recordatorios), no en el inicio.
 *
 * Es Server Component: los datos ya vienen resueltos desde `inicio/page.tsx`,
 * dentro de su `Promise.all`. `DashboardView` es cliente y lo recibe como
 * `ReactNode`, mismo patrón que `aside`.
 */
export function UpcomingAppointmentsWidget({
  turnos,
}: {
  turnos: OwnerAppointment[];
}) {
  if (turnos.length === 0) return null;

  const [proximo, ...siguientes] = turnos;
  const estado = ESTADO_TURNO[proximo.estado];

  return (
    <Card className="border-brand-500/40 bg-brand-50/60 p-5">
      <h2 className="text-foreground flex items-center gap-2 font-semibold">
        <CalendarClock className="text-brand-600 size-[18px]" />
        {turnos.length === 1 ? "Tu próximo turno" : "Tus próximos turnos"}
      </h2>

      <Link
        href={`/mascotas/${proximo.petId}`}
        className="hover:bg-card/70 mt-4 flex items-start gap-3 rounded-lg p-1 transition-colors"
      >
        <Avatar name={proximo.petNombre} src={proximo.petFotoUrl} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-foreground font-semibold">
              {proximo.petNombre} · {proximo.motivo}
            </p>
            <Badge variant={estado.variant}>{estado.label}</Badge>
          </div>

          {/* La fecha y la hora van primero y en grande: es lo único que
              alguien necesita leer de un vistazo para no faltar. */}
          <p className="text-foreground mt-1 text-sm font-medium">
            {formatDate(proximo.fecha)} · {proximo.hora} h
          </p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {proximo.veterinaria}
            {proximo.profesional ? ` · ${proximo.profesional}` : ""}
          </p>
        </div>
      </Link>

      {siguientes.length > 0 ? (
        <ul className="border-border/60 mt-3 space-y-1.5 border-t pt-3">
          {siguientes.map((turno) => (
            <li key={turno.id}>
              <Link
                href={`/mascotas/${turno.petId}`}
                className="text-muted-foreground hover:text-foreground block truncate text-xs"
              >
                {formatDate(turno.fecha)} · {turno.hora} h · {turno.petNombre} ·{" "}
                {turno.veterinaria}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
