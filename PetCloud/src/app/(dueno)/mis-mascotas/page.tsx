import type { Metadata } from "next";

import { PetsView } from "@/features/owner/components/pets/pets-view";

export const metadata: Metadata = { title: "Mis mascotas" };

export default function MisMascotasPage() {
  return <PetsView />;
}
