import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NotesTab } from "@/features/owner/components/pet-profile/notes-tab";
import { canEditPet } from "@/features/owner/lib/permissions";
import {
  getMyPetPermission,
  getNotes,
  getPet,
} from "@/features/owner/data/pet-queries";
import { petMetadata } from "@/features/owner/data/pet-metadata";

export async function generateMetadata({
  params,
}: PageProps<"/mascotas/[petId]/notas">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId, "Notas");
}

export default async function PetNotesPage({
  params,
}: PageProps<"/mascotas/[petId]/notas">) {
  const { petId } = await params;
  const [pet, permiso] = await Promise.all([
    getPet(petId),
    getMyPetPermission(petId),
  ]);
  if (!pet) notFound();

  return (
    <NotesTab
      puedeEditar={canEditPet(permiso)}
      petId={pet.id}
      notes={await getNotes(pet.id)}
      petName={pet.nombre}
    />
  );
}
