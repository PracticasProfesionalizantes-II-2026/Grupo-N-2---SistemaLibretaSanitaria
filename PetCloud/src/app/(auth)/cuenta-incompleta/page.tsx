import type { Metadata } from "next";

import { IncompleteAccountPanel } from "@/features/auth/components/incomplete-account-panel";
import { getCurrentUser } from "@/features/auth/lib/current-user";

export const metadata: Metadata = { title: "Cuenta incompleta" };

/**
 * A dónde mandan `requireMunicipality()` y `requireVet()` a quien tiene sesión y
 * rol pero ninguna ficha detrás. No pasa por ningún guard de panel: son
 * justamente esos guards los que la rechazan.
 */
export default async function CuentaIncompletaPage() {
  const user = await getCurrentUser();

  return <IncompleteAccountPanel email={user?.email ?? ""} />;
}
