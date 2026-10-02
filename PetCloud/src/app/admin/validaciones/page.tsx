import type { Metadata } from "next";

import { ValidationsView } from "@/features/admin/components/validations/validations-view";
import { listLicenseRequests } from "@/features/admin/data/licenses";
import { requireAdmin } from "@/features/admin/lib/admin-session";

export const metadata: Metadata = { title: "Validaciones" };

/**
 * `requireAdmin()` explícito acá, aunque `listLicenseRequests()` ya lo llame:
 * el layout de `/admin` no guarda las rutas y esta página, mientras fue
 * maqueta, no tenía ninguna guarda de backend. Mismo criterio que
 * `equipo/page.tsx` y `usuarios/page.tsx`.
 */
export default async function AdminValidationsPage() {
  await requireAdmin();

  const solicitudes = await listLicenseRequests();

  return <ValidationsView solicitudes={solicitudes} />;
}
