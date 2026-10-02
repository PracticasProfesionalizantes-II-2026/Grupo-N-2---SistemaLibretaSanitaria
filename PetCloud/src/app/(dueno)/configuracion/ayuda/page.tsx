import type { Metadata } from "next";

import { HelpView } from "@/features/owner/components/settings/help-view";

export const metadata: Metadata = { title: "Ayuda y soporte" };

export default function AyudaPage() {
  return <HelpView />;
}
