"use server";

import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { requireUser } from "@/features/auth/lib/current-user";
import {
  GENERIC_ERROR,
  revalidatePet,
} from "@/features/owner/lib/pet-actions-shared";
import {
  hoyISO,
  validarFechaDePeso,
} from "@/features/owner/schemas/weight-record-schema";
import { getDb, insertInto, query, updateSet, withUser } from "@/lib/db";
import type { ActionResult } from "@/features/owner/actions/pets-actions";

/**
 * Registros de salud cargados por el dueño.
 *
 * Todos entran con `verified: false` y `created_by_id` de la sesión. Esa marca
 * es el corazón del producto: lo que el dueño anota de memoria o copiando de la
 * libreta de papel vale para él, pero no es lo mismo que una dosis firmada por
 * alguien con matrícula. El municipio va a mirar la segunda. Un veterinario
 * puede validarlos después (fase 3), y recién ahí `verified` pasa a true.
 *
 * De esa misma marca sale quién puede editar y borrar: el dueño solo toca lo
 * que cargó él. Lo que registró un veterinario es de solo lectura para él, y la
 * restricción viaja **en la consulta** —un filtro más del UPDATE/DELETE— no en
 * si se pinta o no el botón. El discriminador cambia por tabla porque cada una
 * guarda la autoría distinto: `verified` en vacunas y antiparasitarios,
 * `prescribed_by_id`/`diagnosed_by_id` en medicación y diagnósticos, `source`
 * en peso. Es el mismo dato que `mappers.ts` usa para derivar `origen`.
 */

/**
 * Corre la escritura como el usuario y dice si tocó alguna fila. Cada
 * sentencia lleva su propio `has_pet_access(..., 'edit')`: la base no aplica
 * RLS para la conexión de la app.
 */
async function escribir(userId: string, sentencia: SQL): Promise<boolean> {
  try {
    const filas = await withUser(userId, (tx) =>
      query(tx, sql`${sentencia} returning 1`),
    );
    return filas.length > 0;
  } catch (error) {
    console.error("health-records", error);
    return false;
  }
}

const puedeEditar = (petId: string) => sql`has_pet_access(${petId}, 'edit')`;

/** El formulario habla castellano; el enum de la base (002), inglés. */
const TIPO_DESPARASITACION = {
  interno: "internal",
  externo: "external",
  ambos: "both",
} as const;

const TIPO_CONDICION = {
  enfermedad: "disease",
  alergia: "allergy",
  cronica: "chronic",
} as const;

/**
 * El alta y la edición de cada registro comparten el tipo del formulario a
 * propósito: son el mismo formulario. Con dos literales separados, agregar un
 * campo a uno y olvidarlo en el otro no lo marca nadie hasta que el dato se
 * pierde al editar.
 */
export type VaccinationInput = {
  vacuna: string;
  dosis?: string;
  fechaAplicacion: string;
  proximaDosis?: string;
  lugar?: string;
  laboratorio?: string;
  lote?: string;
};

export type DewormingInput = {
  producto: string;
  tipo: "interno" | "externo" | "ambos";
  fecha: string;
  proximaAplicacion?: string;
};

export type MedicationInput = {
  medicamento: string;
  dosis?: string;
  frecuencia?: string;
  desde?: string;
  hasta?: string;
  indicaciones?: string;
  notasDueno?: string;
};

export type WeightRecordInput = {
  pesoKg: number;
  fecha?: string;
  nota?: string;
};

export type ConditionInput = {
  nombre: string;
  tipo: "enfermedad" | "alergia" | "cronica";
  descripcion?: string;
  fechaDiagnostico?: string;
};

/**
 * El `tipo` es el único campo que la edición afloja, y es por una pérdida de
 * dato concreta: `mappers.ts` colapsa a propósito los valores que el dominio no
 * distingue —`chronic` se lee como "enfermedad", `both` como "externo"— así que
 * el formulario de edición prellena el select con un valor que **no** es el que
 * hay guardado. Si ese valor volviera siempre, cambiarle el nombre a una
 * condición crónica la degradaría a enfermedad común, y un antiparasitario
 * "ambos" pasaría a ser solo externo, sin que nadie lo haya pedido.
 *
 * Opcional acá + el modal mandándolo solo si la persona tocó el select = la
 * columna se reescribe únicamente cuando alguien eligió de verdad. El alta
 * sigue exigiéndolo: ahí no hay nada guardado que respetar.
 */
export type DewormingUpdateInput = Omit<DewormingInput, "tipo"> & {
  tipo?: DewormingInput["tipo"];
};

export type ConditionUpdateInput = Omit<ConditionInput, "tipo"> & {
  tipo?: ConditionInput["tipo"];
};

export async function addVaccination(
  petId: string,
  input: VaccinationInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const ok = await escribir(
    user.id,
    insertInto(
      "vaccinations",
      {
        pet_id: petId,
        vaccine_name: input.vacuna.trim(),
        dose_number: input.dosis?.trim() || null,
        applied_at: input.fechaAplicacion,
        next_dose_at: input.proximaDosis || null,
        location: input.lugar?.trim() || null,
        manufacturer: input.laboratorio?.trim() || null,
        lot_number: input.lote?.trim() || null,
        verified: false,
        created_by_id: user.id,
      },
      puedeEditar(petId),
    ),
  );

  if (!ok) return { success: false, error: GENERIC_ERROR };

  revalidatePet(petId);
  return { success: true };
}

export async function addDeworming(
  petId: string,
  input: DewormingInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const ok = await escribir(
    user.id,
    insertInto(
      "dewormings",
      {
        pet_id: petId,
        product_name: input.producto.trim(),
        type: TIPO_DESPARASITACION[input.tipo],
        applied_at: input.fecha,
        next_application_at: input.proximaAplicacion || null,
        verified: false,
        created_by_id: user.id,
      },
      puedeEditar(petId),
    ),
  );

  if (!ok) return { success: false, error: GENERIC_ERROR };

  revalidatePet(petId);
  return { success: true };
}

export async function addMedication(
  petId: string,
  input: MedicationInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const ok = await escribir(
    user.id,
    insertInto(
      "medications",
      {
        pet_id: petId,
        name: input.medicamento.trim(),
        dosage: input.dosis?.trim() || null,
        frequency: input.frecuencia?.trim() || null,
        start_date: input.desde || null,
        end_date: input.hasta || null,
        instructions: input.indicaciones?.trim() || null,
        owner_notes: input.notasDueno?.trim() || null,
        created_by_id: user.id,
      },
      puedeEditar(petId),
    ),
  );

  if (!ok) return { success: false, error: GENERIC_ERROR };

  revalidatePet(petId);
  return { success: true };
}

/**
 * Comprueba que la fecha del pesaje sea posible antes de escribirla.
 *
 * La validación del modal es una cortesía: `recorded_at` viaja desde el
 * cliente y una server action se puede invocar sin pasar por la pantalla. Acá
 * es donde la regla se hace cumplir del lado de la aplicación; la barrera que
 * no se puede evadir es la de la base (migración 052), y esta capa existe para
 * devolver un mensaje entendible en vez del SQLSTATE 23514 disfrazado de
 * `GENERIC_ERROR`.
 *
 * Devuelve el mensaje de error, o `null` si la fecha es plausible. Si la
 * mascota no se puede leer no bloquea: el permiso lo decide la escritura.
 */
async function validarFechaDelPesaje(
  petId: string,
  fecha: string,
): Promise<string | null> {
  const [mascota] = await query<{ date_of_birth: string | null }>(
    getDb(),
    sql`select date_of_birth::text from pets where id = ${petId}`,
  );

  return validarFechaDePeso(fecha, mascota?.date_of_birth, hoyISO());
}

export async function addWeightRecord(
  petId: string,
  input: WeightRecordInput,
): Promise<ActionResult> {
  const user = await requireUser();

  // Vacío significa "hoy", igual que el DEFAULT de la columna.
  const fecha = input.fecha || hoyISO();

  const errorFecha = await validarFechaDelPesaje(petId, fecha);
  if (errorFecha) return { success: false, error: errorFecha };

  const ok = await escribir(
    user.id,
    insertInto(
      "weight_records",
      {
        pet_id: petId,
        value: input.pesoKg,
        recorded_at: fecha,
        note: input.nota?.trim() || null,
        source: "owner",
        created_by_id: user.id,
      },
      puedeEditar(petId),
    ),
  );

  if (!ok) return { success: false, error: GENERIC_ERROR };

  // El peso actual de la ficha sigue al último registrado.
  await escribir(
    user.id,
    sql`update pets set weight = ${input.pesoKg} where id = ${petId}`,
  );

  revalidatePet(petId);
  return { success: true };
}

export async function addCondition(
  petId: string,
  input: ConditionInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const ok = await escribir(
    user.id,
    insertInto(
      "conditions",
      {
        pet_id: petId,
        type: TIPO_CONDICION[input.tipo],
        name: input.nombre.trim(),
        description: input.descripcion?.trim() || null,
        diagnosed_at: input.fechaDiagnostico || null,
        created_by_id: user.id,
      },
      puedeEditar(petId),
    ),
  );

  if (!ok) return { success: false, error: GENERIC_ERROR };

  revalidatePet(petId);
  return { success: true };
}

// ------------------------------------------------------- edición y borrado
//
// Todas las acciones de acá abajo terminan en `.select("id").maybeSingle()` por
// el motivo que ya documenta `deletePet`: cuando RLS —o uno de los filtros de
// origen de más arriba— niega la operación, Postgres **no devuelve error**.
// Afecta cero filas y contesta que salió bien. Sin mirar qué fila se tocó, la
// pantalla contestaba "listo" sobre un registro que sigue igual.

export async function updateVaccination(
  vaccinationId: string,
  petId: string,
  input: VaccinationInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const actualizada = await escribir(
    user.id,
    sql`${updateSet("vaccinations", {
      vaccine_name: input.vacuna.trim(),
      dose_number: input.dosis?.trim() || null,
      applied_at: input.fechaAplicacion,
      next_dose_at: input.proximaDosis || null,
      location: input.lugar?.trim() || null,
      manufacturer: input.laboratorio?.trim() || null,
      lot_number: input.lote?.trim() || null,
    })} where id = ${vaccinationId} and verified = false and declaration_session_id is null and has_pet_access(pet_id, 'edit')`,
  );

  if (!actualizada) {
    return {
      success: false,
      error:
        "Esta vacuna la registró un veterinario o está en revisión: no se puede modificar desde tu cuenta.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

export async function deleteVaccination(
  vaccinationId: string,
  petId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const borrada = await escribir(
    user.id,
    sql`delete from vaccinations where id = ${vaccinationId} and verified = false and declaration_session_id is null and has_pet_access(pet_id, 'edit')`,
  );

  if (!borrada) {
    return {
      success: false,
      error:
        "Esta vacuna la registró un veterinario o está en revisión: no se puede eliminar desde tu cuenta.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

export async function updateDeworming(
  dewormingId: string,
  petId: string,
  input: DewormingUpdateInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const actualizada = await escribir(
    user.id,
    sql`${updateSet("dewormings", {
      product_name: input.producto.trim(),
      ...(input.tipo ? { type: TIPO_DESPARASITACION[input.tipo] } : {}),
      applied_at: input.fecha,
      next_application_at: input.proximaAplicacion || null,
    })} where id = ${dewormingId} and verified = false and has_pet_access(pet_id, 'edit')`,
  );

  if (!actualizada) {
    return {
      success: false,
      error:
        "Esta desparasitación la registró un veterinario: no se puede modificar desde tu cuenta.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

export async function deleteDeworming(
  dewormingId: string,
  petId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const borrada = await escribir(
    user.id,
    sql`delete from dewormings where id = ${dewormingId} and verified = false and has_pet_access(pet_id, 'edit')`,
  );

  if (!borrada) {
    return {
      success: false,
      error:
        "Esta desparasitación la registró un veterinario: no se puede eliminar desde tu cuenta.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

export async function updateMedication(
  medicationId: string,
  petId: string,
  input: MedicationInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const actualizada = await escribir(
    user.id,
    sql`${updateSet("medications", {
      name: input.medicamento.trim(),
      dosage: input.dosis?.trim() || null,
      frequency: input.frecuencia?.trim() || null,
      start_date: input.desde || null,
      end_date: input.hasta || null,
      instructions: input.indicaciones?.trim() || null,
      owner_notes: input.notasDueno?.trim() || null,
    })} where id = ${medicationId} and prescribed_by_id is null and has_pet_access(pet_id, 'edit')`,
  );

  if (!actualizada) {
    return {
      success: false,
      error:
        "Esta medicación la recetó un veterinario: no se puede modificar desde tu cuenta.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

export async function deleteMedication(
  medicationId: string,
  petId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const borrada = await escribir(
    user.id,
    sql`delete from medications where id = ${medicationId} and prescribed_by_id is null and has_pet_access(pet_id, 'edit')`,
  );

  if (!borrada) {
    return {
      success: false,
      error:
        "Esta medicación la recetó un veterinario: no se puede eliminar desde tu cuenta.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

export async function updateCondition(
  conditionId: string,
  petId: string,
  input: ConditionUpdateInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const actualizada = await escribir(
    user.id,
    sql`${updateSet("conditions", {
      ...(input.tipo ? { type: TIPO_CONDICION[input.tipo] } : {}),
      name: input.nombre.trim(),
      description: input.descripcion?.trim() || null,
      diagnosed_at: input.fechaDiagnostico || null,
    })} where id = ${conditionId} and diagnosed_by_id is null and has_pet_access(pet_id, 'edit')`,
  );

  if (!actualizada) {
    return {
      success: false,
      error:
        "Este diagnóstico lo cargó un veterinario: no se puede modificar desde tu cuenta.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

export async function deleteCondition(
  conditionId: string,
  petId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const borrado = await escribir(
    user.id,
    sql`delete from conditions where id = ${conditionId} and diagnosed_by_id is null and has_pet_access(pet_id, 'edit')`,
  );

  if (!borrado) {
    return {
      success: false,
      error:
        "Este diagnóstico lo cargó un veterinario: no se puede eliminar desde tu cuenta.",
    };
  }

  revalidatePet(petId);
  return { success: true };
}

/**
 * Vuelve a apoyar `pets.weight` sobre el registro de peso más reciente que haya
 * quedado, que es la regla que `addWeightRecord` sostiene con su última línea.
 * Editar o borrar el último pesaje mueve cuál es "el último", así que el dato de
 * la ficha se recalcula en vez de escribirse a mano.
 *
 * Si no queda ningún registro, `pets.weight` se deja **como está**: la ficha
 * conserva el último peso conocido. Ponerlo en null o en cero sería inventar un
 * dato —nadie pesó al animal en cero— y esa cifra viaja a la libreta sanitaria y
 * a los cálculos de dosis del veterinario.
 */
async function sincronizarPesoDeFicha(userId: string, petId: string) {
  // Dos registros del mismo día son habituales (la balanza de casa y la de la
  // veterinaria): `created_at` desempata por cuál se cargó después.
  await escribir(
    userId,
    sql`update pets set weight = ultimo.value
          from (select value from weight_records where pet_id = ${petId}
                 order by recorded_at desc, created_at desc limit 1) ultimo
         where pets.id = ${petId}`,
  );
}

export async function updateWeightRecord(
  weightRecordId: string,
  petId: string,
  input: WeightRecordInput,
): Promise<ActionResult> {
  const user = await requireUser();

  if (input.fecha) {
    const errorFecha = await validarFechaDelPesaje(petId, input.fecha);
    if (errorFecha) return { success: false, error: errorFecha };
  }

  const actualizado = await escribir(
    user.id,
    sql`${updateSet("weight_records", {
      value: input.pesoKg,
      note: input.nota?.trim() || null,
      ...(input.fecha ? { recorded_at: input.fecha } : {}),
    })} where id = ${weightRecordId} and source = 'owner' and has_pet_access(pet_id, 'edit')`,
  );

  if (!actualizado) {
    return {
      success: false,
      error:
        "Este peso lo registró un veterinario: no se puede modificar desde tu cuenta.",
    };
  }

  await sincronizarPesoDeFicha(user.id, petId);

  revalidatePet(petId);
  return { success: true };
}

export async function deleteWeightRecord(
  weightRecordId: string,
  petId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const borrado = await escribir(
    user.id,
    sql`delete from weight_records where id = ${weightRecordId} and source = 'owner' and has_pet_access(pet_id, 'edit')`,
  );

  if (!borrado) {
    return {
      success: false,
      error:
        "Este peso lo registró un veterinario: no se puede eliminar desde tu cuenta.",
    };
  }

  await sincronizarPesoDeFicha(user.id, petId);

  revalidatePet(petId);
  return { success: true };
}
