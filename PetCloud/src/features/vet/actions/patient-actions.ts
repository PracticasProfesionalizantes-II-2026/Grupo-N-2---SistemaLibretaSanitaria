"use server";

import "server-only";

import { sql } from "drizzle-orm";

import { requireVet } from "@/features/vet/lib/vet-session";
import {
  ordenarCola,
  toVisit,
  type MedicalRecordRow,
  type VisitRow,
} from "@/features/vet/lib/mappers";
import { toPatient, toPatientOwner } from "@/features/vet/lib/patient-mapper";
import { healthStatus } from "@/features/owner/lib/mappers";
import { getDb, query } from "@/lib/db";
import {
  MEDICAL_RECORD_SELECT,
  PET_SELECT,
  VISIT_SELECT,
} from "@/features/vet/lib/vet-sql";
import type { Tables } from "@/types/database";
import type { Patient } from "@/types/vet";

/**
 * La ficha del paciente y el listado de la institución.
 *
 * Las lecturas van contra las mismas tablas que usa el dueño: no hay una copia
 * paralela de la historia clínica para el veterinario. Lo que cambia es quién
 * puede verla, y eso lo resuelve RLS.
 */

type PetRow = Parameters<typeof toPatient>[0];

/**
 * Todo lo que arma la ficha, en un viaje.
 *
 * Las seis pestañas se piden juntas porque el encabezado ya necesita las
 * alergias —una alergia a la penicilina tiene que estar visible antes de
 * recetar— y traerlas por separado dejaría ese aviso llegando tarde.
 */
export async function getPatientFile(petId: string) {
  await requireVet();
  const db = getDb();

  const [mascota] = await query<PetRow>(
    db,
    sql`${PET_SELECT} where pets.id = ${petId}`,
  );

  if (!mascota) return null;

  const [
    historial,
    vacunas,
    condiciones,
    medicacion,
    estudios,
    antiparasitarios,
    visitas,
  ] = await Promise.all([
    query<MedicalRecordRow>(
      db,
      sql`${MEDICAL_RECORD_SELECT} where m.pet_id = ${petId} order by m.date desc`,
    ),
    query<Tables<"vaccinations">>(
      db,
      sql`select * from vaccinations where pet_id = ${petId} order by applied_at desc`,
    ),
    query<Tables<"conditions">>(
      db,
      sql`select * from conditions where pet_id = ${petId}
           order by diagnosed_at desc nulls last`,
    ),
    query<Tables<"medications">>(
      db,
      sql`select * from medications where pet_id = ${petId}
           order by start_date desc nulls last`,
    ),
    query<Tables<"pet_documents">>(
      db,
      sql`select * from pet_documents where pet_id = ${petId} order by date desc`,
    ),
    query<Tables<"dewormings">>(
      db,
      sql`select * from dewormings where pet_id = ${petId} order by applied_at desc`,
    ),
    query<VisitRow>(
      db,
      sql`${VISIT_SELECT} where v.pet_id = ${petId} order by v.checked_in_at desc`,
    ),
  ]);

  return {
    paciente: {
      ...toPatient(mascota),
      estadoSanitario: healthStatus(mascota.vaccinations ?? []),
    },
    dueno: toPatientOwner(mascota),
    historial,
    vacunas,
    condiciones,
    medicacion,
    estudios,
    antiparasitarios,
    visitas: ordenarCola(visitas.map(toVisit)),
  };
}

/**
 * La tabla de pacientes, con lo que hace falta para leerla y filtrarla.
 *
 * Se arma en el servidor y no en la pantalla porque el dueño, la última visita y
 * quién firmó viven en tres tablas distintas: resolverlo en el cliente serían
 * tres viajes por fila, y la tabla arranca con todas las mascotas de la casa.
 */
export type PatientRow = Patient & {
  duenoNombre: string;
  duenoTelefono: string;
  ultimaVisita?: string;
  /** Nombres de quienes firmaron registros de este paciente acá. */
  profesionales: string[];
};

export async function listPatientRows(): Promise<PatientRow[]> {
  const vet = await requireVet();
  const db = getDb();

  const [visitas, registros] = await Promise.all([
    query<{ pet_id: string; checked_in_at: string }>(
      db,
      sql`select pet_id, checked_in_at::text from visits
           where institution_id = ${vet.institucionId}
           order by checked_in_at desc`,
    ),
    query<{ pet_id: string; nombre: string | null }>(
      db,
      sql`select m.pet_id, trim(p.first_name || ' ' || p.last_name) as nombre
            from medical_records m
            left join vet_professionals vp on vp.id = m.vet_professional_id
            left join profiles p on p.id = vp.profile_id
           where m.institution_id = ${vet.institucionId}`,
    ),
  ]);

  const ids = [
    ...new Set([
      ...visitas.map((v) => v.pet_id),
      ...registros.map((r) => r.pet_id),
    ]),
  ];

  if (!ids.length) return [];

  const ultimaVisita = new Map<string, string>();
  for (const visita of visitas) {
    if (!ultimaVisita.has(visita.pet_id)) {
      ultimaVisita.set(visita.pet_id, visita.checked_in_at.slice(0, 10));
    }
  }

  const firmantes = new Map<string, Set<string>>();
  for (const registro of registros) {
    if (!registro.nombre) continue;
    if (!firmantes.has(registro.pet_id))
      firmantes.set(registro.pet_id, new Set());
    firmantes.get(registro.pet_id)!.add(registro.nombre);
  }

  const data = await query<PetRow>(
    db,
    sql`${PET_SELECT} where pets.id = any(${sql.param(ids)}::uuid[]) order by pets.name`,
  );

  return data.map((row) => ({
    ...toPatient(row),
    estadoSanitario: healthStatus(row.vaccinations ?? []),
    duenoNombre: row.profiles
      ? `${row.profiles.first_name} ${row.profiles.last_name}`.trim()
      : "",
    duenoTelefono: row.profiles?.phone ?? "",
    ultimaVisita: ultimaVisita.get(row.id),
    profesionales: [...(firmantes.get(row.id) ?? [])],
  }));
}
