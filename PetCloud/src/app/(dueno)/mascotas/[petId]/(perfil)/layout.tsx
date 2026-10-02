import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { PetProfileHeader } from "@/features/owner/components/pet-profile/pet-profile-header";
import { petMetadata } from "@/features/owner/data/pet-metadata";
import { canEditPet, canManageAccess } from "@/features/owner/lib/permissions";
import { getMyPetPermission, getPet } from "@/features/owner/data/pet-queries";

export async function generateMetadata({
  params,
}: LayoutProps<"/mascotas/[petId]">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId);
}

export default async function PetProfileLayout({
  children,
  params,
}: LayoutProps<"/mascotas/[petId]">) {
  const { petId } = await params;
  const [pet, permiso] = await Promise.all([
    getPet(petId),
    getMyPetPermission(petId),
  ]);

  if (!pet) notFound();

  const base = `/mascotas/${pet.id}`;
  const tabs = [
    // "Salud" y no "Resumen": la barra lateral del dueño ya nombra así a esta
    // misma página (`owner-nav.ts`), y tener dos nombres para una pantalla hace
    // que el menú y el tab parezcan dos lugares distintos.
    { label: "Salud", href: base },
    { label: "Historial médico", href: `${base}/historial` },
    { label: "Vacunas", href: `${base}/vacunas` },
    { label: "Antiparasitarios", href: `${base}/antiparasitarios` },
    { label: "Medicamentos", href: `${base}/medicamentos` },
    { label: "Enfermedades y alergias", href: `${base}/enfermedades` },
    { label: "Peso", href: `${base}/peso` },
    { label: "Documentos", href: `${base}/documentos` },
    { label: "Notas", href: `${base}/notas` },
  ];

  return (
    <div>
      <PageHeader
        title=""
        breadcrumbs={[
          { label: "Mis mascotas", href: "/mis-mascotas" },
          { label: pet.nombre },
        ]}
      />

      <PetProfileHeader
        pet={pet}
        puedeEditar={canEditPet(permiso)}
        puedeCompartir={canManageAccess(permiso)}
      />

      <div className="mt-8">
        <Tabs items={tabs} />
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}
