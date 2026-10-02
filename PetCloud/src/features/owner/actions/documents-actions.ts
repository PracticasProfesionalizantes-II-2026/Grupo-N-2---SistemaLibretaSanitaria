"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/features/auth/lib/current-user";
import {
  GENERIC_ERROR,
  revalidatePet,
} from "@/features/owner/lib/pet-actions-shared";
import { query, withUser } from "@/lib/db";
import { getStorage, storageUrl } from "@/lib/storage";
import type { ActionResult } from "@/features/owner/actions/pets-actions";

/**
 * Documentos de la mascota: subida, lectura firmada y borrado.
 */

/**
 * Mismos tipos y tope que anuncia `UploadDocumentModal` ("PDF, JPG o PNG,
 * hasta 10 MB"). La validación del cliente es solo para no hacer esperar el
 * round-trip a algo que igual iba a rebotar acá — la que de verdad importa es
 * esta, porque cualquiera puede saltear el input del navegador y pegarle
 * directo a la Server Action.
 */
const TIPOS_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

/** El enum de la base (`document_type`, 001) habla inglés; el formulario, castellano. */
const TIPO_DB: Record<
  string,
  "study" | "prescription" | "certificate" | "other"
> = {
  estudio: "study",
  receta: "prescription",
  certificado: "certificate",
  otro: "other",
};

/**
 * Sube el archivo y registra la fila.
 *
 * La ruta es `{pet_id}/{archivo}`: el primer segmento dice de qué mascota es.
 */
export async function uploadPetDocument(
  petId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const archivo = formData.get("archivo");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim() || undefined;

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { success: false, error: "Elegí un archivo para subir." };
  }

  if (!titulo) {
    return { success: false, error: "Poné un título para el documento." };
  }

  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return {
      success: false,
      error: "Solo se aceptan archivos PDF, JPG o PNG.",
    };
  }

  if (archivo.size > MAX_BYTES) {
    return {
      success: false,
      error: "El archivo no puede pesar más de 10 MB.",
    };
  }

  // Nombre saneado y con marca de tiempo: dos estudios del mismo día no se
  // pisan, y un nombre de archivo raro no puede escaparse de la carpeta.
  const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-80);
  const ruta = `${petId}/${Date.now()}-${limpio}`;

  try {
    await getStorage().upload(
      "pet-documents",
      ruta,
      Buffer.from(await archivo.arrayBuffer()),
      archivo.type,
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  // Solo quien puede editar la mascota carga documentos.
  const insertado = await withUser(user.id, (tx) =>
    query(
      tx,
      sql`insert into pet_documents (pet_id, title, type, file_url, file_size,
            uploaded_by_id, date)
          select ${petId}, ${titulo}, ${TIPO_DB[tipo] ?? "other"}::document_type,
            ${ruta}, ${archivo.size}, ${user.id},
            coalesce(${fecha ?? null}::date, current_date)
           where has_pet_access(${petId}, 'edit')
          returning id`,
    ),
  ).catch(() => []);

  if (insertado.length === 0) {
    // Sin la fila, el archivo quedaría huérfano en el bucket.
    await getStorage().remove("pet-documents", [ruta]);
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePet(petId);
  revalidatePath("/documentos");
  return { success: true };
}

/**
 * URL para ver o descargar un documento. Se sirve por `/api/storage`, y solo
 * a quien tiene acceso a la mascota (primer segmento de la ruta).
 */
export async function getDocumentUrl(
  ruta: string,
): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  const petId = ruta.split("/")[0];

  const [permitido] = await withUser(user.id, (tx) =>
    query<{ ok: boolean }>(
      tx,
      sql`select has_pet_access(${petId}::uuid) as ok`,
    ),
  ).catch(() => [{ ok: false }]);

  if (!permitido?.ok) {
    return { success: false, error: "No pudimos abrir el documento." };
  }

  return { success: true, url: storageUrl("pet-documents", ruta) };
}

export async function deletePetDocument(
  documentId: string,
  petId: string,
  ruta: string,
): Promise<ActionResult> {
  const user = await requireUser();

  let borrado: { file_url: string } | undefined;
  try {
    [borrado] = await withUser(user.id, (tx) =>
      query<{ file_url: string }>(
        tx,
        sql`delete from pet_documents
             where id = ${documentId} and has_pet_access(pet_id, 'edit')
            returning file_url`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  if (!borrado) {
    return {
      success: false,
      error: "No se pudo eliminar el documento: puede que ya no exista.",
    };
  }

  // El archivo se borra recién **después** de confirmar que la fila se fue.
  // La ruta sale de la fila borrada, no del navegador.
  void ruta;
  await getStorage().remove("pet-documents", [borrado.file_url]);

  revalidatePet(petId);
  revalidatePath("/documentos");
  return { success: true };
}
