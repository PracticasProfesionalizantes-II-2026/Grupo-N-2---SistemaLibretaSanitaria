"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import { DECLARACION_JURADA } from "@/features/vet/lib/firma-declaracion";
import { requireVet } from "@/features/vet/lib/vet-session";
import {
  FIRMA_MAX_BYTES,
  FIRMA_TIPO_MIME,
  signatureSchema,
} from "@/features/vet/schemas/signature-schemas";
import { rpc, withUser } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/**
 * Registrar una firma: el dibujo es opcional (migración 067), el resto no.
 *
 * El molde de la subida es `owner/actions/documents-actions.ts:47-135` — se
 * sube primero, se escribe la base después, y si la base rechaza se saca el
 * archivo. Acá ese rollback importa más que allá: el bucket es write-once
 * desde la 063, así que un objeto huérfano en una ruta ocupa esa ruta para
 * siempre. La política `vet_signatures_delete_unclaimed` existe justamente
 * para que este `remove` siga siendo posible mientras ninguna fila nombre el
 * objeto.
 *
 * Cuando NO hay dibujo, no hay nada que subir: se llama al RPC con
 * `p_image_path = null` directamente. `insertarFirma()`
 * (`src/lib/pdf/firma.ts`) ya sabe renderizar ese caso — es el mismo texto de
 * respaldo que corría para todo el mundo antes de la 063.
 *
 * La validación de verdad está en la base y no acá: `register_vet_signature()`
 * es `SECURITY INVOKER`, así que la política de INSERT de `vet_signatures`
 * —pertenencia más `is_validated_vet()`— decide si la fila entra. Esto
 * adelanta el rechazo para no hacer esperar un viaje que igual iba a rebotar.
 */

const GENERIC_ERROR = "No pudimos guardar tu firma. Probá de nuevo.";

/** Cuánto vive el enlace firmado con el que la pantalla muestra una firma. */

export async function registerVetSignature(
  formData: FormData,
): Promise<ActionResult<{ firmaId: string }>> {
  const vet = await requireVet();
  const imagen = formData.get("imagen");

  const datos = signatureSchema.safeParse({
    aclaracion: String(formData.get("aclaracion") ?? ""),
    matricula: String(formData.get("matricula") ?? ""),
    declaracion: formData.get("declaracion") === "true",
  });

  if (!datos.success) {
    return { success: false, error: datos.error.issues[0].message };
  }

  // El dibujo es opcional. Si vino, tiene que ser un PNG dentro del tope; si
  // no vino, se registra la firma sin imagen y listo.
  const hayDibujo = imagen instanceof File && imagen.size > 0;

  if (hayDibujo) {
    if (imagen.type !== FIRMA_TIPO_MIME) {
      return {
        success: false,
        error: "La firma tiene que ser una imagen PNG con fondo transparente.",
      };
    }

    if (imagen.size > FIRMA_MAX_BYTES) {
      return {
        success: false,
        error: "La imagen de la firma es demasiado pesada.",
      };
    }
  }

  let ruta: string | null = null;

  if (hayDibujo) {
    /**
     * Una ruta nueva por firma, nunca la misma dos veces. De eso depende el
     * congelamiento: si una firma reemplazara el archivo de la anterior, cada
     * certificado ya emitido pasaría a mostrar el dibujo nuevo. El primer
     * segmento es el id del profesional porque de ahí sacan la seguridad las
     * políticas del bucket (010) y el CHECK `vet_signatures_path_matches_owner`.
     */
    ruta = `${vet.profesionalId}/${crypto.randomUUID()}.png`;

    try {
      await getStorage().upload(
        "vet-signatures",
        ruta,
        Buffer.from(await imagen.arrayBuffer()),
        FIRMA_TIPO_MIME,
      );
    } catch {
      return { success: false, error: GENERIC_ERROR };
    }
  }

  let firmaId: string | null = null;
  try {
    const [fila] = await withUser(vet.usuario.id, (tx) =>
      rpc<{ register_vet_signature: string }>(tx, "register_vet_signature", {
        p_image_path: ruta,
        p_clarification: datos.data.aclaracion,
        p_license_number: datos.data.matricula,
        p_sworn_statement: DECLARACION_JURADA,
      }),
    );
    firmaId = fila?.register_vet_signature ?? null;
  } catch (error) {
    console.error("registerVetSignature", error);
  }

  if (!firmaId) {
    if (ruta) await getStorage().remove("vet-signatures", [ruta]);
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath("/veterinaria/configuracion");
  return { success: true, firmaId };
}
