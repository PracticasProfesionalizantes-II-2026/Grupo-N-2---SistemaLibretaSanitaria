"use server";

import "server-only";

import { sql } from "drizzle-orm";

import { requireVet } from "@/features/vet/lib/vet-session";
import { isQrCode } from "@/lib/qr-code";
import { getDb, query } from "@/lib/db";
import { PET_SELECT } from "@/features/vet/lib/vet-sql";
import type { Patient, PatientOwner } from "@/types/vet";
import { toPatient, toPatientOwner } from "@/features/vet/lib/patient-mapper";

type PetRow = Parameters<typeof toPatient>[0];

/**
 * Escaneo del collar y búsqueda manual.
 *
 * Para una institución validada, el acceso no pide un vínculo previo con la
 * mascota: un animal que llega a la guardia hay que poder atenderlo aunque
 * nunca haya pisado esta veterinaria. Una sin validar (080) solo encuentra a
 * sus propios pacientes; los nuevos llegan con el QR de autogestión de la sala
 * de espera. Lo hace cumplir RLS (`pets_select_vet`), acá solo se traduce.
 */

export type ScanResult =
  | { estado: "ok"; paciente: Patient; owner: PatientOwner | null }
  | { estado: "qr-invalido" }
  | { estado: "no-encontrada" }
  | { estado: "revocado" };

/**
 * Busca la mascota de un código.
 *
 * Se distinguen tres finales distintos porque significan cosas distintas para
 * quien tiene el animal adelante:
 *
 * - **QR inválido**: lo que se leyó no tiene forma de código PetCloud. Suele ser
 *   que el lector agarró otra etiqueta.
 * - **Revocado**: el código existió y el dueño lo dio de baja. La chapita es
 *   vieja; la mascota está en el sistema pero con otro código.
 * - **No encontrada**: forma correcta, nunca existió.
 */
export async function findPetByQr(qrCode: string): Promise<ScanResult> {
  await requireVet();

  const codigo = qrCode.trim().toUpperCase();
  if (!isQrCode(codigo)) return { estado: "qr-invalido" };

  const db = getDb();
  const [data] = await query<PetRow>(
    db,
    sql`${PET_SELECT} where pets.qr_code = ${codigo}`,
  );

  if (data) {
    return {
      estado: "ok",
      paciente: toPatient(data),
      owner: toPatientOwner(data),
    };
  }

  // Sin fila vigente: puede ser un collar dado de baja. El histórico lo sabe.
  const [historico] = await query<{ revoked_at: string | null }>(
    db,
    sql`select revoked_at from pet_qr_codes where code = ${codigo}`,
  );

  if (historico?.revoked_at) return { estado: "revocado" };

  return { estado: "no-encontrada" };
}

export type PatientSearchResult = {
  patient: Patient;
  /** Llega de la misma consulta a `pets`, no de un segundo viaje a `profiles`. */
  owner: PatientOwner | null;
};

/**
 * Búsqueda manual, para cuando el collar no está o no se deja leer.
 *
 * Busca por nombre de la mascota, por apellido del dueño y por código parcial.
 * `or()` de PostgREST no atraviesa la tabla relacionada, así que el dueño se
 * resuelve en una segunda consulta y se unen los resultados acá.
 */
export async function searchPatients(
  busqueda: string,
): Promise<PatientSearchResult[]> {
  await requireVet();

  const texto = busqueda.trim();
  if (texto.length < 2) return [];

  const patron = `%${texto}%`;

  const filas = await query<PetRow>(
    getDb(),
    sql`${PET_SELECT}
        where pets.name ilike ${patron} or pets.qr_code ilike ${patron}
           or pets.owner_id in (select id from profiles
               where first_name ilike ${patron} or last_name ilike ${patron})
        limit 40`,
  );

  const porId = new Map<string, PatientSearchResult>();
  for (const row of filas) {
    porId.set(row.id, { patient: toPatient(row), owner: toPatientOwner(row) });
  }

  return [...porId.values()].sort((a, b) =>
    a.patient.nombre.localeCompare(b.patient.nombre),
  );
}

/**
 * Una mascota por id, con su dueño.
 *
 * La usa "Registrar llegada" cuando se entra desde Pacientes: la mascota ya
 * viene elegida y hay que mostrarla sin que nadie la busque. Misma consulta y
 * mismo RLS que la búsqueda; solo cambia el filtro.
 */
export async function getPatientForCheckIn(
  petId: string,
): Promise<PatientSearchResult | null> {
  await requireVet();

  const [data] = await query<PetRow>(
    getDb(),
    sql`${PET_SELECT} where pets.id = ${petId}`,
  );

  if (!data) return null;
  return { patient: toPatient(data), owner: toPatientOwner(data) };
}
