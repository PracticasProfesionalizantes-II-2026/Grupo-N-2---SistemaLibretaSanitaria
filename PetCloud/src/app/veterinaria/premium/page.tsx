import type { Metadata } from "next";

import { PremiumView } from "@/features/vet/components/premium/premium-view";
import {
  getCurrentPremiumPrice,
  getInstitutionSubscription,
} from "@/features/vet/data/subscription";
import { requireVet } from "@/features/vet/lib/vet-session";

export const metadata: Metadata = { title: "Premium" };

/**
 * A diferencia del resto del panel, esta pantalla usa `requireVet()` y no
 * `requirePremiumVet()`: tiene que ser visible tanto para instituciones sin
 * Premium como con Premium — es el único lugar desde donde una institución
 * puede darse de alta.
 */
export default async function PremiumPage() {
  const vet = await requireVet();

  const [price, subscription] = await Promise.all([
    getCurrentPremiumPrice(),
    getInstitutionSubscription(vet.institucionId),
  ]);

  return (
    <PremiumView
      soyTitular={vet.rolEnInstitucion === "owner"}
      premium={vet.premium}
      price={price}
      subscription={subscription}
    />
  );
}
