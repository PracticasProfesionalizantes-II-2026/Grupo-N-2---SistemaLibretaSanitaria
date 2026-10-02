import type { Metadata } from "next";

import { listTeam } from "@/features/vet/actions/institution-actions";
import { TurnosView } from "@/features/vet/components/turnos/turnos-view";
import { getAgenda } from "@/features/vet/data/appointments";
import { requirePremiumVet } from "@/features/vet/lib/vet-premium";

export const metadata: Metadata = { title: "Turnos" };

/**
 * `requirePremiumVet()` corta acá si la institución no tiene Premium activo
 * — redirige a `/veterinaria/premium`, no hay nada más que manejar en esta
 * pantalla (mismo criterio que cualquier otra pantalla detrás de
 * `requireVet()`).
 *
 * `getAgenda()` sin rango: trae toda la agenda de la institución, pasada y
 * futura (mismo comportamiento por defecto que documenta la función). No hay
 * todavía una vista separada de "historial", así que acotar a "solo próximos
 * turnos" sería una decisión de producto que esta fase no pidió.
 */
export default async function TurnosPage() {
  await requirePremiumVet();

  const [agenda, equipo] = await Promise.all([getAgenda(), listTeam()]);

  return <TurnosView agenda={agenda} equipo={equipo} />;
}
