import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { estadoAntirrabicaPublico } from "@/features/public-qr/data/public-pet";
import { PetQrView } from "@/features/owner/components/pet-profile/pet-qr-view";
import { canEditPet } from "@/features/owner/lib/permissions";
import {
  getMyPetPermission,
  getPet,
  getPetQrPrivacy,
} from "@/features/owner/data/pet-queries";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = { title: "ID / QR" };

export default async function PetQrPage({
  params,
}: PageProps<"/mascotas/[petId]/qr">) {
  const { petId } = await params;
  const [pet, siteUrl, permiso] = await Promise.all([
    getPet(petId),
    getSiteUrl(),
    getMyPetPermission(petId),
  ]);
  if (!pet) notFound();

  // Recién ahora, con `getPet` (RLS) confirmando que la persona ve la mascota:
  // la función pública va por el cliente admin.
  const [estadoAntirrabica, privacidad] = await Promise.all([
    estadoAntirrabicaPublico(pet.id),
    getPetQrPrivacy(pet.id),
  ]);

  return (
    <PetQrView
      pet={pet}
      siteUrl={siteUrl}
      estadoAntirrabica={estadoAntirrabica}
      config={privacidad.config}
      registroMunicipal={privacidad.registroMunicipal}
      puedeEditar={canEditPet(permiso)}
    />
  );
}
