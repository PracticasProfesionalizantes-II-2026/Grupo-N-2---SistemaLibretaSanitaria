import "server-only";

import { getStorage, storagePathFromUrl } from "@/lib/storage";

const BUCKET_FOTOS = "pet-photos";

/**
 * Los buckets cuya convención de ruta arranca con el id de la mascota
 * (`{pet_id}/...`), que es lo que hace posible limpiarlos por mascota.
 */
const BUCKETS_POR_MASCOTA = [
  BUCKET_FOTOS,
  "pet-documents",
  "medical-studies",
] as const;

/**
 * Borra una foto de `pet-photos`, pero **solo si ninguna otra columna la sigue
 * referenciando**.
 */
export async function borrarFotoSiNadieLaUsa(
  urlABorrar: string | null | undefined,
  urlsQueSiguenEnUso: (string | null | undefined)[],
) {
  if (!urlABorrar) return;
  if (urlsQueSiguenEnUso.some((url) => url === urlABorrar)) return;

  const ruta = storagePathFromUrl(BUCKET_FOTOS, urlABorrar);
  if (ruta) await getStorage().remove(BUCKET_FOTOS, [ruta]);
}

/**
 * Borra todo lo que tengan guardado estas mascotas, en todos sus buckets.
 *
 * Se llama **después** de confirmar que la fila se borró. No devuelve error:
 * es limpieza, y si falla quedan archivos de más.
 */
export async function borrarArchivosDeMascotas(petIds: string[]) {
  const storage = getStorage();
  for (const bucket of BUCKETS_POR_MASCOTA) {
    for (const petId of petIds) {
      await storage.removeFolder(bucket, petId).catch(() => undefined);
    }
  }
}

/** Ídem para la carpeta de fotos de perfil de una persona. */
export async function borrarFotosDePerfil(profileId: string) {
  await getStorage()
    .removeFolder("profile-photos", profileId)
    .catch(() => undefined);
}
