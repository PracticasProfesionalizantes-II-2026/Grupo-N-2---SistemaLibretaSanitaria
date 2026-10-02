import type { Metadata } from "next";
import { Suspense } from "react";

import { ScanView } from "@/features/vet/components/scan/scan-view";

export const metadata: Metadata = { title: "Escanear QR" };

export default function ScanPage() {
  // `useSearchParams` necesita un límite de Suspense para no bloquear el prerender.
  return (
    <Suspense>
      <ScanView />
    </Suspense>
  );
}
