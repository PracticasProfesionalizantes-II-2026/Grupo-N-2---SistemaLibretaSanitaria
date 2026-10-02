import type { Metadata } from "next";

import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = {
  title: "Política de cookies",
  // Todavía es un texto pendiente. Que Google la liste vacía es peor que
  // que no la liste: se saca el noindex cuando el contenido exista.
  robots: { index: false, follow: true },
};

export default function CookiesPage() {
  return <ComingSoon title="Política de cookies" />;
}
