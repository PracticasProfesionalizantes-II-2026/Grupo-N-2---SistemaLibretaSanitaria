"use client";

import { Download, Pencil, QrCode, UserPlus } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PetFormModal } from "@/features/owner/components/pets/pet-form-modal";
import { SharePetAccessModal } from "@/features/owner/components/pets/share-pet-access-modal";
import { GeneratePdfModal } from "@/features/owner/components/pet-profile/generate-pdf-modal";
import { capitalize, formatAge } from "@/lib/format";
import type { Pet } from "@/types/pet";

export function PetProfileHeader({
  pet,
  puedeEditar,
  puedeCompartir,
}: {
  pet: Pet;
  /** `edit` u `owner`: editar y collar. La RLS lo exige igual. */
  puedeEditar: boolean;
  /** Solo `owner`: compartir, invitar, revocar. */
  puedeCompartir: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sharing, setSharing] = useState(false);

  const chips = [
    capitalize(pet.especie),
    pet.raza,
    capitalize(pet.sexo),
    `${pet.pesoKg} kg`,
    pet.castrado ? "Castrado" : "Sin castrar",
  ];

  return (
    <>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={pet.nombre} src={pet.fotoUrl} size="xl" expandable />
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {pet.nombre}
            </h1>
            {/* Sin fecha de nacimiento no hay edad que mostrar: el párrafo
                vacío dejaba un hueco de una línea debajo del nombre. */}
            {formatAge(pet.fechaNacimiento) ? (
              <p className="text-muted-foreground text-sm">
                {formatAge(pet.fechaNacimiento)}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Badge key={chip} variant="neutral">
                  {chip}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {puedeEditar ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11 md:h-9"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
              Editar
            </Button>
          ) : null}
          <ButtonLink
            href={`/mascotas/${pet.id}/qr`}
            variant="outline"
            size="sm"
            className="h-11 md:h-9"
          >
            <QrCode className="size-4" />
            Collar / QR
          </ButtonLink>
          {puedeCompartir ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11 md:h-9"
              onClick={() => setSharing(true)}
            >
              <UserPlus className="size-4" />
              Compartir acceso
            </Button>
          ) : null}
          <Button
            size="sm"
            className="h-11 md:h-9"
            onClick={() => setGeneratingPdf(true)}
          >
            <Download className="size-4" />
            Descargar libreta PDF
          </Button>
        </div>
      </div>

      <PetFormModal
        open={editing}
        onClose={() => setEditing(false)}
        pet={pet}
      />
      <GeneratePdfModal
        open={generatingPdf}
        onClose={() => setGeneratingPdf(false)}
        pet={pet}
      />
      <SharePetAccessModal
        open={sharing}
        onClose={() => setSharing(false)}
        lockedPetId={pet.id}
      />
    </>
  );
}
