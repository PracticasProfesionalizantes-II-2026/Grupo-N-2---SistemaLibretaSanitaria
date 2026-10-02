"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { motivoSinFirma } from "@/features/vet/lib/puede-firmar";
import { requireVet } from "@/features/vet/lib/vet-session";
import { insertInto, query, withUser } from "@/lib/db";

/**
 * Consultas: el registro clínico que firma un profesional.
 *
 * La regla que gobierna todo esto son dos: **firmar exige matrícula validada**
 * y, desde el portón de la migración `065`, **una firma cargada en Ajustes**.
 * Sin cualquiera de las dos se puede cargar la atención entera y dejarla como
 * borrador; lo que no se puede es publicarla en la libreta del dueño, porque es
 * eso lo que le da valor sanitario frente al municipio.
 *
 * La comprobación de verdad vive en la base (trigger
 * `medical_records_enforce_signature`, migraciones 008/009/064/065). Acá se
 * repite antes de escribir, y desde la `065` ya no es solo cortesía: el trigger
 * rechaza el INSERT entero, así que escribir `is_signed: true` sin firma
 * cargada **perdería la consulta recién escrita**. Degradar a borrador acá es
 * lo que la salva.
 */

export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string; code?: "sin-matricula" | "sin-firma" };

const GENERIC_ERROR = "No pudimos guardar la consulta. Probá de nuevo.";

const SIN_MATRICULA =
  "Tu matrícula todavía está en validación, así que la consulta quedó guardada como borrador. Vas a poder firmarla cuando PetCloud confirme tus datos con el colegio profesional.";

const SIN_FIRMA =
  "Todavía no cargaste tu firma, así que la consulta quedó guardada como borrador. Cargala en Ajustes y vas a poder firmarla sin volver a escribirla.";

/**
 * El tipo que elige el veterinario, traducido a la columna.
 *
 * La pantalla no ofrece "desparasitación": eso se carga desde antiparasitarios,
 * que tiene su propia tabla con producto y próxima aplicación.
 */
const TIPO_DB = {
  control: "checkup",
  urgencia: "emergency",
  cirugia: "surgery",
  vacunacion: "vaccination",
  otro: "other",
} as const;

export type ConsultationInput = {
  petId: string;
  tipo: keyof typeof TIPO_DB;
  motivo?: string;
  diagnostico?: string;
  observaciones?: string;
  pesoKg?: number;
  proximaVisita?: string;
};

function toRow(input: ConsultationInput) {
  return {
    pet_id: input.petId,
    type: TIPO_DB[input.tipo],
    reason: input.motivo?.trim() || null,
    diagnosis: input.diagnostico?.trim() || null,
    observations: input.observaciones?.trim() || null,
    weight_at_visit: input.pesoKg ?? null,
    next_visit_date: input.proximaVisita || null,
  };
}

/**
 * Crea la consulta, como borrador o firmada.
 *
 * Si se pide firmar sin matrícula validada **no falla**: guarda el borrador y
 * avisa por qué no se firmó. Perder lo escrito sería el peor final posible para
 * alguien que acaba de cargar una atención entera.
 */
export async function createConsultation(
  input: ConsultationInput,
  { asDraft }: { asDraft: boolean },
): Promise<ActionResult<{ recordId: string; firmada: boolean }>> {
  const vet = await requireVet();

  // El mismo motivo que le muestra el formulario, resuelto de nuevo acá: la
  // pantalla no protege nada y una acción de servidor se puede llamar sola.
  const motivo = motivoSinFirma(vet);
  const quiereFirmar = !asDraft;
  const puedeFirmar = quiereFirmar && motivo === null;

  let data: { id: string } | undefined;
  try {
    data = await withUser(vet.usuario.id, async (tx) => {
      const [registro] = await query<{ id: string }>(
        tx,
        sql`${insertInto("medical_records", {
          ...toRow(input),
          vet_professional_id: vet.profesionalId,
          institution_id: vet.institucionId,
          is_draft: !puedeFirmar,
          is_signed: puedeFirmar,
        })} returning id`,
      );

      if (input.pesoKg) {
        await tx.execute(
          insertInto("weight_records", {
            pet_id: input.petId,
            value: input.pesoKg,
            source: "vet",
            created_by_id: vet.usuario.id,
          }),
        );
      }
      return registro;
    });
  } catch (error) {
    console.error("createConsultation", error);
  }

  if (!data) return { success: false, error: GENERIC_ERROR };

  revalidatePath(`/veterinaria/pacientes/${input.petId}`, "layout");
  revalidatePath(`/mascotas/${input.petId}`, "layout");

  if (quiereFirmar && !puedeFirmar) {
    return motivo === "sin-firma"
      ? { success: false, error: SIN_FIRMA, code: "sin-firma" }
      : { success: false, error: SIN_MATRICULA, code: "sin-matricula" };
  }

  return { success: true, recordId: data.id, firmada: puedeFirmar };
}
