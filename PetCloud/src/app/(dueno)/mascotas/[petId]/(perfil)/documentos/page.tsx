import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentsTab } from "@/features/owner/components/pet-profile/documents-tab";
import { canEditPet } from "@/features/owner/lib/permissions";
import {
  getMyPetPermission,
  getDocuments,
  getPet,
} from "@/features/owner/data/pet-queries";
import { petMetadata } from "@/features/owner/data/pet-metadata";

export async function generateMetadata({
  params,
}: PageProps<"/mascotas/[petId]/documentos">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId, "Documentos");
}

export default async function PetDocumentsPage({
  params,
}: PageProps<"/mascotas/[petId]/documentos">) {
  const { petId } = await params;
  const [pet, permiso] = await Promise.all([
    getPet(petId),
    getMyPetPermission(petId),
  ]);
  if (!pet) notFound();

  return (
    <DocumentsTab
      puedeEditar={canEditPet(permiso)}
      documents={await getDocuments(pet.id)}
      petId={pet.id}
      petName={pet.nombre}
    />
  );
}
