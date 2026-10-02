import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConditionsTab } from "@/features/owner/components/pet-profile/conditions-tab";
import { canEditPet } from "@/features/owner/lib/permissions";
import {
  getMyPetPermission,
  getConditions,
  getPet,
} from "@/features/owner/data/pet-queries";
import { petMetadata } from "@/features/owner/data/pet-metadata";

export async function generateMetadata({
  params,
}: PageProps<"/mascotas/[petId]/enfermedades">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId, "Enfermedades y alergias");
}

export default async function PetConditionsPage({
  params,
}: PageProps<"/mascotas/[petId]/enfermedades">) {
  const { petId } = await params;
  const [pet, permiso] = await Promise.all([
    getPet(petId),
    getMyPetPermission(petId),
  ]);
  if (!pet) notFound();

  return (
    <ConditionsTab
      puedeEditar={canEditPet(permiso)}
      petId={pet.id}
      conditions={await getConditions(pet.id)}
      petName={pet.nombre}
    />
  );
}
