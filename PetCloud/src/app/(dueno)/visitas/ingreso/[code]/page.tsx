import type { Metadata } from "next";

import { SelfCheckInView } from "@/features/owner/components/visits/self-check-in-view";
import { listMyPets } from "@/features/owner/data/owner-queries";

export const metadata: Metadata = { title: "Ingreso a la sala de espera" };

/**
 * Deep-link de entrada: a donde llega la cámara del celular al escanear el
 * QR de la sala de espera (el QR codifica esta URL completa, ver
 * `generateWaitingRoomQrCode` en `lib/qr-code.ts`).
 *
 * No hace falta tocar `app-routes.ts`: `/visitas` ya está en `OWNER_ROUTES`
 * y `matches()` la reconoce por prefijo, así que el proxy ya redirige a un
 * visitante sin sesión antes de que este componente se ejecute (Req. 8).
 */
export default async function VisitCheckInPage({
  params,
}: PageProps<"/visitas/ingreso/[code]">) {
  const { code } = await params;
  const misMascotas = await listMyPets();

  return <SelfCheckInView code={code} misMascotas={misMascotas} />;
}
