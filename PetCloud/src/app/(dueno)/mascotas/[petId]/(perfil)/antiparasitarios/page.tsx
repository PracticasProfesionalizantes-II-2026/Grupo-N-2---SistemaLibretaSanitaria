import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AntiparasiticsTab } from "@/features/owner/components/pet-profile/antiparasitics-tab";
import { canEditPet } from "@/features/owner/lib/permissions";
import {
  getMyPetPermission,
  getAntiparasitics,
  getPet,
} from "@/features/owner/data/pet-queries";
import { petMetadata } from "@/features/owner/data/pet-metadata";

export async function generateMetadata({
  params,
}: PageProps<"/mascotas/[petId]/antiparasitarios">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId, "Antiparasitarios");
}

export default async function PetAntiparasiticsPage({
  params,
}: PageProps<"/mascotas/[petId]/antiparasitarios">) {
  const { petId } = await params;
  const [pet, permiso] = await Promise.all([
    getPet(petId),
    getMyPetPermission(petId),
  ]);
  if (!pet) notFound();

  return (
    <AntiparasiticsTab
      puedeEditar={canEditPet(permiso)}
      petId={pet.id}
      antiparasitics={await getAntiparasitics(pet.id)}
      petName={pet.nombre}
    />
  );
}
