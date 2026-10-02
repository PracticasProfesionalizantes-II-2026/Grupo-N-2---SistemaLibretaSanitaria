"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/features/vet/actions/consultation-actions";
import { toDbSpecies } from "@/features/owner/lib/mappers";
import { toVaccinePreset } from "@/features/vet/lib/mappers";
import { requireVet } from "@/features/vet/lib/vet-session";
import { getDb, query, withUser } from "@/lib/db";
import type { Tables } from "@/types/supabase";
import type { Species } from "@/types/pet";
import type { VaccinePreset } from "@/types/vet";

/** Catálogo de vacunas de la institución (`vaccine_presets`). */

const GENERIC_ERROR = "No pudimos guardar la vacuna. Probá de nuevo.";

export type VaccinePresetInput = {
  vacuna: string;
  laboratorio: string;
  /** Ya traducida al valor de la columna (`application_route`). */
  via: string;
  especies: Species[];
  dosisPorDefecto: string;
  intervaloMeses: number;
  obligatoria: boolean;
};

function revalidar() {
  revalidatePath("/veterinaria/vacunaciones");
  revalidatePath("/veterinaria/configuracion");
}

export async function getVaccinePresets(): Promise<VaccinePreset[]> {
  const vet = await requireVet();
  const rows = await query<Tables<"vaccine_presets">>(
    getDb(),
    sql`select * from vaccine_presets
         where institution_id = ${vet.institucionId}
         order by vaccine_name`,
  );
  return rows.map(toVaccinePreset);
}

export async function createVaccinePreset(
  input: VaccinePresetInput,
): Promise<ActionResult> {
  const vet = await requireVet();
  try {
    await withUser(vet.usuario.id, (tx) =>
      tx.execute(sql`
        insert into vaccine_presets (institution_id, vaccine_name, manufacturer,
          application_route, species, default_dose_number,
          booster_interval_days, is_mandatory)
        values (${vet.institucionId}, ${input.vacuna.trim()}, ${input.laboratorio || null},
          ${input.via || null}::application_route,
          ${sql.param(input.especies.map(toDbSpecies))}::pet_species[],
          ${input.dosisPorDefecto || null}, ${input.intervaloMeses * 30},
          ${input.obligatoria})`),
    );
  } catch (error) {
    console.error("createVaccinePreset", error);
    return { success: false, error: GENERIC_ERROR };
  }
  revalidar();
  return { success: true };
}

export async function updateVaccinePreset(
  id: string,
  input: VaccinePresetInput,
): Promise<ActionResult> {
  const vet = await requireVet();
  try {
    await withUser(vet.usuario.id, (tx) =>
      tx.execute(sql`
        update vaccine_presets set
          vaccine_name = ${input.vacuna.trim()},
          manufacturer = ${input.laboratorio || null},
          application_route = ${input.via || null}::application_route,
          species = ${sql.param(input.especies.map(toDbSpecies))}::pet_species[],
          default_dose_number = ${input.dosisPorDefecto || null},
          booster_interval_days = ${input.intervaloMeses * 30},
          is_mandatory = ${input.obligatoria}
        where id = ${id} and institution_id = ${vet.institucionId}`),
    );
  } catch (error) {
    console.error("updateVaccinePreset", error);
    return { success: false, error: GENERIC_ERROR };
  }
  revalidar();
  return { success: true };
}

export async function deleteVaccinePreset(id: string): Promise<ActionResult> {
  const vet = await requireVet();
  try {
    await withUser(vet.usuario.id, (tx) =>
      tx.execute(
        sql`delete from vaccine_presets where id = ${id} and institution_id = ${vet.institucionId}`,
      ),
    );
  } catch (error) {
    console.error("deleteVaccinePreset", error);
    return { success: false, error: "No pudimos borrar la vacuna." };
  }
  revalidar();
  return { success: true };
}
