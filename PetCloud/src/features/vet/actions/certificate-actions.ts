"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { toPatient, toPatientOwner } from "@/features/vet/lib/patient-mapper";
import { motivoSinFirma } from "@/features/vet/lib/puede-firmar";
import { requireVet } from "@/features/vet/lib/vet-session";
import { getDb, insertInto, query, withUser } from "@/lib/db";
import { PET_SELECT } from "@/features/vet/lib/vet-sql";
import { getStorage, storageUrl } from "@/lib/storage";
import type { Pet } from "@/types/pet";

/**
 * Certificados sanitarios: emitirlos y dejarlos en los documentos de la mascota.
 *
 * El PDF se arma en el navegador —igual que la libreta del dueño, y por la misma
 * razón: la firma se descarga con una URL temporal y ahí ya está el documento
 * entero—. El servidor hace las dos puntas: junta los datos que el certificado
 * necesita y guarda el archivo terminado.
 *
 * Emitirlo exige matrícula validada y, desde el portón de la migración `065`,
 * una firma cargada. Un certificado es exactamente el acto que una matrícula
 * habilita: sin ella no hay nada que certificar. Y sin firma el trigger
 * `enforce_certificate_requires_signature` rechaza la fila, así que cortar acá
 * evita dejar el PDF subido al bucket apuntando a un documento que no existe.
 */

export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string; code?: "sin-matricula" | "sin-firma" };

const GENERIC_ERROR = "No pudimos emitir el certificado. Probá de nuevo.";

const SIN_MATRICULA =
  "Tu matrícula todavía está en validación. Un certificado se emite contra una matrícula habilitada, así que vas a poder firmarlo cuando PetCloud confirme tus datos con el colegio profesional.";

const SIN_FIRMA =
  "Todavía no cargaste tu firma. Un certificado se emite firmado, así que cargala en Ajustes y vas a poder emitirlo.";

/** Una hora alcanza de sobra para armar un PDF y no deja el enlace dando vueltas. */

export type CertificateContext = {
  mascota: Pet;
  dueno: { nombre: string; dni: string; telefono: string; direccion: string };
  profesional: { nombre: string; matricula: string; firmaUrl: string | null };
  institucion: { nombre: string; direccion: string; telefono: string };
};

/**
 * Lo que va adentro del certificado.
 *
 * Incluye la URL firmada de la imagen de su firma **vigente**: `vet.firmaUrl`
 * sale de la fila de `vet_signatures` que la sesión resuelve (064), no de la
 * columna deprecada del profesional. El `signature_id` de la fila de
 * `pet_documents` no se manda desde acá: lo estampa el trigger
 * `pet_documents_certificate_signature`, que es lo que hace que ningún camino
 * de escritura tenga que acordarse.
 */
export async function getCertificateContext(
  petId: string,
): Promise<CertificateContext | null> {
  const vet = await requireVet();

  const [mascota] = await query<Parameters<typeof toPatient>[0]>(
    getDb(),
    sql`${PET_SELECT} where pets.id = ${petId}`,
  );

  if (!mascota) return null;

  // Un certificado sin número de matrícula no es un certificado. Desde la 058
  // la columna admite NULL para quien no ejerce, así que acá se corta: la
  // negativa con motivo la da `emitCertificate`, que ya distingue el caso con
  // el código `sin-matricula`.
  if (!vet.matricula) return null;

  let firmaUrl: string | null = null;

  if (vet.firmaUrl) firmaUrl = storageUrl("vet-signatures", vet.firmaUrl);

  const dueno = toPatientOwner(mascota);

  return {
    mascota: toPatient(mascota),
    dueno: {
      nombre: dueno?.nombre ?? "",
      dni: dueno?.dni ?? "",
      telefono: dueno?.telefono ?? "",
      direccion: dueno?.direccion ?? "",
    },
    profesional: {
      nombre: [vet.usuario.nombre, vet.usuario.apellido]
        .filter(Boolean)
        .join(" "),
      matricula: vet.matricula,
      firmaUrl,
    },
    institucion: {
      nombre: vet.institucion.nombre,
      direccion: vet.institucion.direccion,
      telefono: vet.institucion.telefono,
    },
  };
}

/**
 * Guarda el certificado terminado en los documentos de la mascota.
 *
 * La ruta es `{pet_id}/{archivo}` y de esa convención depende toda la seguridad
 * del bucket: las políticas de Storage sacan el id de la mascota del primer
 * segmento para decidir quién puede tocarlo (ver `003_owner_storage.sql` y la
 * `016`, que es la que habilita al veterinario a escribir acá).
 */
export async function saveCertificate(
  petId: string,
  formData: FormData,
): Promise<ActionResult> {
  const vet = await requireVet();
  const motivo = motivoSinFirma(vet);

  if (motivo === "sin-firma") {
    return { success: false, error: SIN_FIRMA, code: "sin-firma" };
  }

  if (motivo === "sin-matricula") {
    return { success: false, error: SIN_MATRICULA, code: "sin-matricula" };
  }

  const archivo = formData.get("archivo");
  const titulo = String(formData.get("titulo") ?? "").trim();

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { success: false, error: GENERIC_ERROR };
  }

  if (!titulo) {
    return { success: false, error: GENERIC_ERROR };
  }

  // Misma convención que `uploadPetDocument`: un nombre de archivo raro no
  // puede escaparse de la carpeta, y la marca de tiempo evita que dos
  // certificados del mismo día se pisen.
  const limpio = titulo.replace(/[^\w.\-]/g, "_").slice(0, 60);

  const ruta = `${petId}/${Date.now()}-${limpio}.pdf`;

  try {
    await getStorage().upload(
      "pet-documents",
      ruta,
      Buffer.from(await archivo.arrayBuffer()),
      "application/pdf",
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  try {
    await withUser(vet.usuario.id, (tx) =>
      tx.execute(
        insertInto("pet_documents", {
          pet_id: petId,
          title: titulo,
          type: "certificate",
          file_url: ruta,
          file_size: archivo.size,
          uploaded_by_id: vet.usuario.id,
        }),
      ),
    );
  } catch {
    await getStorage().remove("pet-documents", [ruta]);
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath(`/veterinaria/pacientes/${petId}`, "layout");
  revalidatePath(`/mascotas/${petId}`, "layout");
  revalidatePath("/documentos");

  return { success: true };
}
