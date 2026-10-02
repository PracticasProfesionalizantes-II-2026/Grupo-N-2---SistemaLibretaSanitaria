import { CalendarCheck, Syringe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  DoseUrgency,
  UpcomingDose,
} from "@/features/owner/data/health-queries";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const URGENCY: Record<
  DoseUrgency,
  { label: string; variant: "danger" | "warning" | "neutral"; card: string }
> = {
  vencida: {
    label: "Vencida",
    variant: "danger",
    card: "border-danger/30 bg-danger-soft",
  },
  proxima: {
    label: "Próxima",
    variant: "warning",
    card: "border-warning/30 bg-warning-soft",
  },
  programada: { label: "Programada", variant: "neutral", card: "" },
};

/** Qué decir cuando no hay dosis pendientes, sin inventar un "al día". */
export function mensajeSinPendientes(
  petsSinVacunas: string[],
  ningunaCargada: boolean,
): string {
  if (ningunaCargada) {
    return "Todavía no hay vacunas cargadas. Cuando tu veterinario cargue la primera, vas a ver acá lo que falta.";
  }
  if (petsSinVacunas.length > 0) {
    const quienes = petsSinVacunas.join(", ");
    return `No hay dosis pendientes en las vacunas cargadas. ${quienes} ${
      petsSinVacunas.length === 1 ? "todavía no tiene" : "todavía no tienen"
    } ninguna vacuna cargada.`;
  }
  return "No hay dosis pendientes. Todo el plan sanitario está al día.";
}

/**
 * Próximas dosis, sin importar quién las aplique.
 */
export function VaccinationPlan({
  doses,
  showPetName = false,
  title = "Próximas vacunas",
  petsSinVacunas = [],
  totalPets = 0,
}: {
  doses: UpcomingDose[];
  showPetName?: boolean;
  title?: string;
  /**
   * Nombres de las mascotas sin ninguna vacuna cargada (`healthStatus` ===
   * `"sin-datos"`). Sin dosis pendientes no alcanza para decir "al día": una
   * lista vacía también sale de no tener vacunas, y afirmarlo ahí contradecía
   * el "Sin datos" de la misma mascota en otra tarjeta.
   */
  petsSinVacunas?: string[];
  totalPets?: number;
}) {
  if (doses.length === 0) {
    const ningunaCargada = totalPets > 0 && petsSinVacunas.length === totalPets;

    return (
      <Card className="p-5">
        <h2 className="text-foreground flex items-center gap-2 font-semibold">
          <CalendarCheck
            className={cn(
              "size-[18px]",
              petsSinVacunas.length > 0
                ? "text-muted-foreground"
                : "text-success",
            )}
          />
          {title}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {mensajeSinPendientes(petsSinVacunas, ningunaCargada)}
        </p>
      </Card>
    );
  }

  return (
    <div>
      <h2 className="text-foreground mb-3 flex items-center gap-2 font-semibold">
        <Syringe className="text-brand-600 size-[18px]" />
        {title}
      </h2>

      <ul className="space-y-3">
        {doses.map((dose) => {
          const urgency = URGENCY[dose.urgencia];

          return (
            <li key={dose.id}>
              <Card className={cn("p-4", urgency.card)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-foreground font-semibold">
                    {showPetName ? `${dose.petNombre} · ` : ""}
                    {dose.vacuna}
                  </p>
                  <Badge variant={urgency.variant}>{urgency.label}</Badge>
                </div>

                <p className="text-muted-foreground mt-1 text-sm">
                  {dose.urgencia === "vencida" ? "Venció el" : "Toca el"}{" "}
                  {formatLongDate(dose.fecha)} · última aplicación en{" "}
                  {dose.ultimoLugar}
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
