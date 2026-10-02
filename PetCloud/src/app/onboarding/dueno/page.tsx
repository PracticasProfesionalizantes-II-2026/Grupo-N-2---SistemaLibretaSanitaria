import type { Metadata } from "next";

import { OwnerOnboardingWizard } from "@/features/onboarding/components/owner-onboarding-wizard";
import { listMyPendingPetInvites } from "@/features/owner/data/owner-queries";

export const metadata: Metadata = { title: "Cargá tu primera mascota" };

export default async function OnboardingDuenoPage() {
  const invitaciones = await listMyPendingPetInvites();

  return <OwnerOnboardingWizard invitaciones={invitaciones} />;
}
