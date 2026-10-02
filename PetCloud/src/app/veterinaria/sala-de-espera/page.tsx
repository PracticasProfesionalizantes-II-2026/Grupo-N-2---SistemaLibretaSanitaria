import type { Metadata } from "next";
import { Suspense } from "react";

import { listWaitingRoom } from "@/features/vet/actions/waiting-room-actions";
import { getLiveWaitingRoomQrSession } from "@/features/vet/actions/waiting-room-qr-actions";
import { WaitingRoomView } from "@/features/vet/components/waiting-room/waiting-room-view";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = { title: "Sala de espera" };

export default async function WaitingRoomPage() {
  const [queue, qrSession, siteUrl] = await Promise.all([
    listWaitingRoom(),
    getLiveWaitingRoomQrSession(),
    getSiteUrl(),
  ]);

  // `useSearchParams` necesita un límite de Suspense para no bloquear el prerender.
  return (
    <Suspense>
      <WaitingRoomView
        queue={queue}
        initialQrSession={qrSession}
        siteUrl={siteUrl}
      />
    </Suspense>
  );
}
