import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VaccinationsTab } from "@/features/owner/components/pet-profile/vaccinations-tab";
import { getUpcomingDoses } from "@/features/owner/data/health-queries";
import { canEditPet } from "@/features/owner/lib/permissions";
import {
  getMyPetPermission,
  getPet,
  getVaccinations,
} from "@/features/owner/data/pet-queries";
import { petMetadata } from "@/features/owner/data/pet-metadata";

export async function generateMetadata({
  params,
}: PageProps<"/mascotas/[petId]/vacunas">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId, "Vacunas");
}

export default async function PetVaccinesPage({
  params,
}: PageProps<"/mascotas/[petId]/vacunas">) {
  const { petId } = await params;
  const [pet, permiso] = await Promise.all([
    getPet(petId),
    getMyPetPermission(petId),
  ]);
  if (!pet) notFound();

  const [vaccinations, upcomingDoses] = await Promise.all([
    getVaccinations(pet.id),
    getUpcomingDoses(pet.id),
  ]);

  return (
    <VaccinationsTab
      puedeEditar={canEditPet(permiso)}
      petId={pet.id}
      vaccinations={vaccinations}
      petName={pet.nombre}
      upcomingDoses={upcomingDoses}
    />
  );
}
