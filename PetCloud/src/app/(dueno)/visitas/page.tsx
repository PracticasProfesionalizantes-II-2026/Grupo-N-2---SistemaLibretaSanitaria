import type { Metadata } from "next";

import { VisitsView } from "@/features/owner/components/visits/visits-view";
import { listMyVisits } from "@/features/owner/data/owner-queries";

export const metadata: Metadata = { title: "Visitas" };

export default async function VisitsPage() {
  // Las atenciones las escribe el veterinario (fase 3). Hasta entonces esto
  // devuelve vacío y la pantalla muestra su propio mensaje.
  const visits = await listMyVisits();

  return <VisitsView visits={visits} />;
}
