import type { Metadata } from "next";

import { SettingsView } from "@/features/owner/components/settings/settings-view";

export const metadata: Metadata = { title: "Configuración" };

export default function ConfiguracionPage() {
  return <SettingsView />;
}
