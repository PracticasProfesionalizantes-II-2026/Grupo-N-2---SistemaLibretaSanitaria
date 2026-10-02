import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WeightTab } from "@/features/owner/components/pet-profile/weight-tab";
import { canEditPet } from "@/features/owner/lib/permissions";
import {
  getMyPetPermission,
  getPet,
  getWeightEntries,
} from "@/features/owner/data/pet-queries";
import { petMetadata } from "@/features/owner/data/pet-metadata";

export async function generateMetadata({
  params,
}: PageProps<"/mascotas/[petId]/peso">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId, "Peso");
}

export default async function PetWeightPage({
  params,
}: PageProps<"/mascotas/[petId]/peso">) {
  const { petId } = await params;
  const [pet, permiso] = await Promise.all([
    getPet(petId),
    getMyPetPermission(petId),
  ]);
  if (!pet) notFound();

  return (
    <WeightTab
      puedeEditar={canEditPet(permiso)}
      petId={pet.id}
      entries={await getWeightEntries(pet.id)}
      petName={pet.nombre}
      fechaNacimiento={pet.fechaNacimiento}
    />
  );
}
