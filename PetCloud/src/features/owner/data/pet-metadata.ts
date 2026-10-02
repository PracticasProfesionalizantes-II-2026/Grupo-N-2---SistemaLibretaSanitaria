import "server-only";

import type { Metadata } from "next";

import { getPet } from "@/features/owner/data/pet-queries";

/**
 * Título de pestaña para las pantallas del perfil de una mascota.
 *
 * Solo el nombre (o "Vacunas de Toby"): el template del layout raíz ya le
 * agrega " · PetCloud". `getPet` está cacheada por request, así que esto no
 * suma una consulta a la que ya hace la pantalla.
 */
export async function petMetadata(
  petId: string,
  seccion?: string,
): Promise<Metadata> {
  const pet = await getPet(petId);
  if (!pet) return {};
  return { title: seccion ? `${seccion} de ${pet.nombre}` : pet.nombre };
}
