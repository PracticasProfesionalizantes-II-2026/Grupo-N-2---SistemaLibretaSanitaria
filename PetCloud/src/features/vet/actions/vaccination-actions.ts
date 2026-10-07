"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { toVaccineApplication } from "@/features/vet/lib/mappers";
import { motivoSinFirma } from "@/features/vet/lib/puede-firmar";
import { requireVet } from "@/features/vet/lib/vet-session";
import { getDb, insertInto, query, withUser } from "@/lib/db";
import type { Tables } from "@/types/database";
import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import type { VaccineApplication } from "@/types/vet";

/**
 * Vacunaciones aplicadas por la institución.
 *
 * A diferencia de las que carga el dueño (fase 2, `verified: false`), estas
 * entran verificadas: las aplicó alguien con matrícula y el lote quedó
 * registrado. Es la diferencia que el municipio mira cuando controla la
 * cobertura de un barrio.
 */

const GENERIC_ERROR = "No pudimos registrar la vacunación. Probá de nuevo.";

const SIN_MATRICULA =
  "Tu matrícula todavía está en validación. Una vacunación aplicada por la institución entra verificada, y verificada quiere decir firmada, así que vas a poder registrarla cuando PetCloud confirme tus datos con el colegio profesional.";

const SIN_FIRMA =
  "Todavía no cargaste tu firma. Una vacunación aplicada por la institución entra firmada, así que cargala en Ajustes y vas a poder registrarla.";

const VIA_DB = {
  Inyectable: "injectable",
  Oral: "oral",
  Nasal: "nasal",
  Tópica: "topical",
  Otra: "other",
} as const;

export type VaccinationInput = {
  petId: string;
  vacuna: string;
  laboratorio?: string;
  lote?: string;
  dosis?: string;
  via?: keyof typeof VIA_DB;
  fechaAplicacion: string;
  proximaDosis?: string;
};

export async function recordVaccination(
  input: VaccinationInput,
): Promise<ActionResult<{ vaccinationId: string }>> {
  const vet = await requireVet();

  // Esta fila entra con `verified: true`, y desde el portón de la `065` eso es
  // firmar: sin firma cargada el trigger la rechaza. Cortar acá cambia un error
  // genérico de PostgreSQL por el motivo real, que se resuelve en Ajustes.
  const motivo = motivoSinFirma(vet);

  if (motivo === "sin-firma") {
    return { success: false, error: SIN_FIRMA, code: "sin-firma" };
  }

  if (motivo === "sin-matricula") {
    return { success: false, error: SIN_MATRICULA, code: "sin-matricula" };
  }

  let data: { id: string } | undefined;
  try {
    [data] = await withUser(vet.usuario.id, (tx) =>
      query<{ id: string }>(
        tx,
        sql`${insertInto("vaccinations", {
          pet_id: input.petId,
          vaccine_name: input.vacuna.trim(),
          manufacturer: input.laboratorio?.trim() || null,
          lot_number: input.lote?.trim() || null,
          dose_number: input.dosis?.trim() || null,
          application_route: input.via ? VIA_DB[input.via] : null,
          applied_at: input.fechaAplicacion,
          next_dose_at: input.proximaDosis || null,
          location: vet.institucion.nombre,
          applied_by_id: vet.profesionalId,
          // Aplicada por un profesional: no necesita que nadie la valide después.
          verified: true,
          created_by_id: vet.usuario.id,
        })} returning id`,
      ),
    );
  } catch (error) {
    console.error("recordVaccination", error);
  }

  if (!data) return { success: false, error: GENERIC_ERROR };

  revalidatePath(`/veterinaria/pacientes/${input.petId}`, "layout");
  revalidatePath("/veterinaria/vacunaciones");
  revalidatePath(`/mascotas/${input.petId}`, "layout");

  return { success: true, vaccinationId: data.id };
}

/**
 * El libro con los nombres ya resueltos.
 *
 * La aplicación guarda identificadores; la planilla que se presenta al municipio
 * necesita nombres. Se traducen acá y no en la pantalla porque el profesional
 * sale de `vet_professionals` unido a `profiles`, que desde el cliente serían
 * dos viajes más por fila.
 */
export type VaccinationRow = VaccineApplication & {
  mascota: string;
  profesional: string;
};

export async function listVaccinationRows(filtros?: {
  desde?: string;
  hasta?: string;
  vacuna?: string;
}): Promise<VaccinationRow[]> {
  const vet = await requireVet();

  const desde = filtros?.desde
    ? sql` and v.applied_at >= ${filtros.desde}`
    : sql``;
  const hasta = filtros?.hasta
    ? sql` and v.applied_at <= ${filtros.hasta}`
    : sql``;
  const vacuna = filtros?.vacuna
    ? sql` and v.vaccine_name ilike ${`%${filtros.vacuna}%`}`
    : sql``;

  const data = await query<
    Tables<"vaccinations"> & {
      mascota: string | null;
      profesional: string | null;
    }
  >(
    getDb(),
    sql`select v.*, pt.name as mascota,
               trim(p.first_name || ' ' || p.last_name) as profesional
          from vaccinations v
          join vet_professionals vp on vp.id = v.applied_by_id
          left join profiles p on p.id = vp.profile_id
          left join pets pt on pt.id = v.pet_id
         where vp.institution_id = ${vet.institucionId}${desde}${hasta}${vacuna}
         order by v.applied_at desc`,
  );

  return data.map((row) => ({
    ...toVaccineApplication(row),
    mascota: row.mascota ?? "",
    profesional: row.profesional ?? "",
  }));
}

/**
 * Verifica una dosis cargada por el dueño. Qué transición es legal lo decide
 * el trigger `protect_vaccination_verification()` (076), no esta acción.
 */
export async function verifyVaccineAction(
  vaccinationId: string,
  petId: string,
): Promise<ActionResult> {
  const vet = await requireVet();

  try {
    const filas = await withUser(vet.usuario.id, (tx) =>
      query(
        tx,
        sql`update vaccinations set verified = true
             where id = ${vaccinationId} and pet_id = ${petId}
               and verified = false
            returning id`,
      ),
    );
    if (filas.length === 0) {
      return { success: false, error: "No se pudo verificar la vacuna." };
    }
  } catch (error) {
    console.error("verifyVaccineAction", error);
    return { success: false, error: "No se pudo verificar la vacuna." };
  }

  revalidatePath(`/veterinaria/pacientes/${petId}`, "layout");
  revalidatePath(`/mascotas/${petId}`, "layout");
  return { success: true };
}
