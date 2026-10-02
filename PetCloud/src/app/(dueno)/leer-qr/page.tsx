import type { Metadata } from "next";

import { ReadQrView } from "@/features/owner/components/scan/read-qr-view";

export const metadata: Metadata = { title: "Leer QR" };

export default function ReadQrPage() {
  return <ReadQrView />;
}
