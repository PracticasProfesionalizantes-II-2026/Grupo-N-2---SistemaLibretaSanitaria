"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/features/auth/lib/current-user";
import type { ActionResult } from "@/features/owner/actions/pets-actions";
import {
  GENERIC_ERROR,
  revalidatePet,
} from "@/features/owner/lib/pet-actions-shared";
import { borrarFotoSiNadieLaUsa } from "@/features/owner/lib/pet-storage";
import { getDb, query, withUser } from "@/lib/db";
import { validarImagenElegida } from "@/lib/image-formats";
import { getStorage, storagePathFromUrl, storageUrl } from "@/lib/storage";

/**
 * Fotos que suben a Storage además de escribir en la base: la de la mascota y
 * la de perfil del dueño.
 */

function validarImagen(archivo: FormDataEntryValue | null): archivo is File {
  return archivo instanceof File && archivo.size > 0;
}

function leerImagen(
  formData: FormData,
): { ok: true; archivo: File } | { ok: false; error: string } {
  const archivo = formData.get("archivo");
  if (!validarImagen(archivo)) {
    return { ok: false, error: "Elegí una imagen para subir." };
  }
  const valido = validarImagenElegida(archivo);
  if (!valido.ok) return { ok: false, error: valido.error };
  return { ok: true, archivo };
}

async function subir(bucket: string, carpeta: string, archivo: File) {
  const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-80);
  const ruta = `${carpeta}/${Date.now()}-${limpio}`;
  await getStorage().upload(
    bucket,
    ruta,
    Buffer.from(await archivo.arrayBuffer()),
    archivo.type,
  );
  return ruta;
}

async function fotoActual(petId: string) {
  const [fila] = await query<{ photo_url: string | null }>(
    getDb(),
    sql`select photo_url from pets where id = ${petId}`,
  );
  return fila?.photo_url ?? null;
}

/**
 * Sube la foto, actualiza `pets.photo_url` y borra el archivo anterior. No se
 * toca lo viejo hasta confirmar que la fila se actualizó: si el usuario no
 * tiene permiso de edición, la foto recién subida se descarta.
 */
export async function uploadPetPhoto(
  petId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const imagen = leerImagen(formData);
  if (!imagen.ok) return { success: false, error: imagen.error };

  const previa = await fotoActual(petId);

  let ruta: string;
  try {
    ruta = await subir("pet-photos", petId, imagen.archivo);
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  const actualizado = await withUser(user.id, (tx) =>
    query(
      tx,
      sql`update pets set photo_url = ${storageUrl("pet-photos", ruta)}
           where id = ${petId} and has_pet_access(id, 'edit') returning id`,
    ),
  ).catch(() => []);

  if (actualizado.length === 0) {
    await getStorage().remove("pet-photos", [ruta]);
    return { success: false, error: GENERIC_ERROR };
  }

  await borrarFotoSiNadieLaUsa(previa, []);

  revalidatePet(petId);
  return { success: true };
}

export async function removePetPhoto(petId: string): Promise<ActionResult> {
  const user = await requireUser();

  const previa = await fotoActual(petId);

  const actualizado = await withUser(user.id, (tx) =>
    query(
      tx,
      sql`update pets set photo_url = null
           where id = ${petId} and has_pet_access(id, 'edit') returning id`,
    ),
  ).catch(() => []);

  if (actualizado.length === 0) {
    return { success: false, error: GENERIC_ERROR };
  }

  await borrarFotoSiNadieLaUsa(previa, []);

  revalidatePet(petId);
  return { success: true };
}

// -------------------------------------------------------------------- perfil

async function borrarAvatarViejo(url: string | null) {
  const ruta = url ? storagePathFromUrl("profile-photos", url) : null;
  if (ruta) await getStorage().remove("profile-photos", [ruta]);
}

/** Sube la foto de perfil del dueño. */
export async function uploadOwnerAvatar(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const imagen = leerImagen(formData);
  if (!imagen.ok) return { success: false, error: imagen.error };

  let ruta: string;
  try {
    ruta = await subir("profile-photos", user.id, imagen.archivo);
    await withUser(user.id, (tx) =>
      tx.execute(
        sql`update profiles set avatar_url = ${storageUrl("profile-photos", ruta)} where id = ${user.id}`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  await borrarAvatarViejo(user.avatarUrl);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function removeOwnerAvatar(): Promise<ActionResult> {
  const user = await requireUser();

  try {
    await withUser(user.id, (tx) =>
      tx.execute(
        sql`update profiles set avatar_url = null where id = ${user.id}`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  await borrarAvatarViejo(user.avatarUrl);

  revalidatePath("/", "layout");
  return { success: true };
}
