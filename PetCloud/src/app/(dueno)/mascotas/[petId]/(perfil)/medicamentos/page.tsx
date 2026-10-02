import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MedicationsTab } from "@/features/owner/components/pet-profile/medications-tab";
import { canEditPet } from "@/features/owner/lib/permissions";
import {
  getMyPetPermission,
  getMedications,
  getPet,
} from "@/features/owner/data/pet-queries";
import { petMetadata } from "@/features/owner/data/pet-metadata";

export async function generateMetadata({
  params,
}: PageProps<"/mascotas/[petId]/medicamentos">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId, "Medicamentos");
}

export default async function PetMedicationsPage({
  params,
}: PageProps<"/mascotas/[petId]/medicamentos">) {
  const { petId } = await params;
  const [pet, permiso] = await Promise.all([
    getPet(petId),
    getMyPetPermission(petId),
  ]);
  if (!pet) notFound();

  return (
    <MedicationsTab
      puedeEditar={canEditPet(permiso)}
      petId={pet.id}
      medications={await getMedications(pet.id)}
      petName={pet.nombre}
    />
  );
}
