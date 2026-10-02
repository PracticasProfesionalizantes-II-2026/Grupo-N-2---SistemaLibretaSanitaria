import { revalidatePath } from "next/cache";

/**
 * Lo que comparten las acciones de la mascota: el mensaje de error genérico y
 * el refresco de las pantallas que muestran el dato.
 */

export const GENERIC_ERROR = "No pudimos guardar el registro. Probá de nuevo.";

/** Refresca las dos pantallas que muestran el dato: la pestaña y el resumen. */
export function revalidatePet(petId: string) {
  revalidatePath(`/mascotas/${petId}`, "layout");
  revalidatePath("/inicio");
}
