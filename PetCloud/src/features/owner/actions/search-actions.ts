"use server";

import "server-only";

import { requireUser } from "@/features/auth/lib/current-user";
import {
  searchMyPets,
  type PetSearchResult,
} from "@/features/owner/data/owner-queries";

/**
 * Buscador del topbar del dueño. Exige sesión; el filtro por dueño vive en la
 * consulta, no acá.
 */
export async function searchOwnerPets(
  query: string,
): Promise<PetSearchResult[]> {
  await requireUser();
  return searchMyPets(typeof query === "string" ? query.slice(0, 80) : "");
}
