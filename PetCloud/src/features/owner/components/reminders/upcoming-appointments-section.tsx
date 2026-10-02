import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ESTADO_TURNO,
  type OwnerAppointment,
} from "@/features/owner/data/appointment-queries";
import { mostrarSeccionTurnos } from "@/features/owner/lib/appointments-visibility";
import { formatLongDate } from "@/lib/format";

/**
 * Los turnos agendados, en la pantalla de Recordatorios.
 *
 * Están acá porque es donde el dueño viene a ver "qué tengo que hacer": las
 * vacunas y los antiparasitarios pendientes ya viven en esta pantalla, y un
 * turno es exactamente la misma clase de cosa. Que estuviera solo dentro del
 * perfil de cada mascota obligaba a entrar mascota por mascota para armar la
 * agenda de la semana.
 *
 * Sin turnos próximos la sección no se muestra (`mostrarSeccionTurnos`): los
 * turnos solo existen si la veterinaria usa el módulo Premium, y para la
 * mayoría de los dueños un "no tenés turnos" permanente es ruido. Acá la señal
 * es la lista de próximos del dueño, que es lo único que ya viene consultado;
 * pedir el historial completo de cada mascota solo para decidir si mostrar un
 * vacío no se paga.
 *
 * El badge dice el estado real (`Programado` / `Confirmado`) en vez de una
 * etiqueta fija: un turno que la veterinaria todavía no confirmó y uno
 * confirmado no son lo mismo para quien tiene que decidir si ir.
 */
export function UpcomingAppointmentsSection({
  turnos,
}: {
  turnos: OwnerAppointment[];
}) {
  if (!mostrarSeccionTurnos(turnos)) return null;

  return (
    <Card className="mb-5 p-5">
      <h2 className="text-foreground flex items-center gap-2 font-semibold">
        <CalendarClock className="text-brand-600 size-[18px]" />
        Próximos turnos
      </h2>

      <ul className="mt-4 space-y-2">
        {turnos.map((turno) => {
          const estado = ESTADO_TURNO[turno.estado];

          return (
            <li key={turno.id}>
              <Link
                href={`/mascotas/${turno.petId}`}
                className="border-border hover:bg-muted flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <Avatar
                  name={turno.petNombre}
                  src={turno.petFotoUrl}
                  size="sm"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-foreground text-sm font-medium">
                      {turno.petNombre} · {turno.motivo}
                    </p>
                    <Badge variant={estado.variant}>{estado.label}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {formatLongDate(turno.fecha)} · {turno.hora} h ·{" "}
                    {turno.veterinaria}
                    {turno.profesional ? ` · ${turno.profesional}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
