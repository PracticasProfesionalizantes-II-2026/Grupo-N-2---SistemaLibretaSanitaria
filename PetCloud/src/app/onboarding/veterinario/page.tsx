import type { Metadata } from "next";

import { VetOnboardingWizard } from "@/features/onboarding/components/vet-onboarding-wizard";

export const metadata: Metadata = { title: "Configurá tu veterinaria" };

export default function OnboardingVeterinarioPage() {
  return <VetOnboardingWizard />;
}
