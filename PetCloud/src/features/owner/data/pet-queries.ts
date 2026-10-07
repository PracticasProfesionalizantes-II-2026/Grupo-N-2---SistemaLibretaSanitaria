import "server-only";

import { cache } from "react";
import { sql } from "drizzle-orm";

import { getDb, query } from "@/lib/db";
import { getCurrentUser } from "@/features/auth/lib/current-user";
import { myPetScope } from "@/features/owner/data/owner-scope";
import {
  healthStatus,
  toAntiparasitic,
  toCondition,
  toMedication,
  toPet,
  toPetDocument,
  toPetNote,
  toReminder,
  toVaccination,
  toWeightEntry,
} from "@/features/owner/lib/mappers";
import {
  parseQrPublicConfig,
  type QrPublicConfig,
} from "@/features/public-qr/lib/qr-public-config";
import type { Permiso } from "@/features/owner/lib/permissions";
import type { Pet } from "@/types/pet";
import type { Reminder } from "@/types/schedule";
import type { Tables } from "@/types/database";
import type { Visit } from "@/types/visit";
import {
  VISIT_SELECT,
  toVisit,
  type VisitRow,
} from "@/features/owner/data/visit-mapper";

/**
 * Lecturas de UNA mascota: su ficha y cada solapa de su libreta.
 *
 * Mismos nombres que cuando leían arrays en memoria; lo único que cambió para
 * quien las usa es que devuelven promesas.
 */

/**
 * La RLS NO alcanza como filtro de "lo mío": `*_select_vet` (migración 008)
 * deja a cualquier cuenta con fila en `vet_professionals` leer todas las
 * mascotas y sus tablas hijas, y se suma (OR) a las políticas de dueño. Un
 * veterinario que además es dueño vería mascotas ajenas en su portal.
 *
 * `getPet` es la puerta de toda pantalla `/mascotas/[petId]` y de la libreta
 * PDF, así que acota explícitamente con `owner-scope.ts`: una mascota ajena
 * devuelve `undefined`, igual que una inexistente. Las consultas hijas de este
 * archivo se apoyan en que esa puerta ya se cruzó.
 */

/**
 * Envuelta en `cache` de React: el layout del perfil la llama desde
 * `generateMetadata` (para el título de la pestaña) y desde el render, y la
 * página también. Dentro de un mismo request va una sola vez a la base.
 */
export const getPet = cache(async function getPet(
  petId: string,
): Promise<Pet | undefined> {
  const user = await getCurrentUser();
  if (!user) return undefined;

  const [data] = await query<
    Tables<"pets"> & { vaccinations: { next_dose_at: string | null }[] }
  >(
    getDb(),
    sql`select pets.*, coalesce((select json_agg(json_build_object(
          'next_dose_at', v.next_dose_at)) from vaccinations v
          where v.pet_id = pets.id), '[]') as vaccinations
        from pets where pets.id = ${petId} and ${myPetScope(user.id)}`,
  );
  if (!data) return undefined;

  const { vaccinations, ...pet } = data;

  return toPet(pet, { estadoSanitario: healthStatus(vaccinations) });
});

/**
 * Qué nivel tiene la persona logueada sobre esta mascota, para decidir qué
 * botones mostrar. `undefined` si es ajena o no hay sesión.
 *
 * Va aparte de `getPet` para no cambiar su forma: la lee la libreta PDF y otras
 * pantallas que no necesitan el permiso. Como `getPet`, no se apoya en la RLS
 * para saber "qué es mío": el dueño se decide por `owner_id` y el resto por su
 * propia fila en `pet_shared_access`. Es solo para la interfaz; la RLS es la
 * que hace cumplir el permiso al escribir.
 */
export const getMyPetPermission = cache(async function getMyPetPermission(
  petId: string,
): Promise<Permiso | undefined> {
  const user = await getCurrentUser();
  if (!user) return undefined;

  const db = getDb();
  const [propia] = await query(
    db,
    sql`select id from pets where id = ${petId} and owner_id = ${user.id}`,
  );
  if (propia) return "owner";

  const [acceso] = await query<{ permission: Permiso }>(
    db,
    sql`select permission from pet_shared_access
         where pet_id = ${petId} and shared_with_id = ${user.id} limit 1`,
  );

  return acceso?.permission ?? undefined;
});

/**
 * La privacidad del collar y el registro municipal, para la pantalla del QR.
 * `Pet` no los trae: son datos de esa sola pantalla. Con RLS, como el resto.
 */
export async function getPetQrPrivacy(
  petId: string,
): Promise<{ config: QrPublicConfig; registroMunicipal: string | null }> {
  const [data] = await query<{
    qr_public_config: unknown;
    municipal_registry_number: string | null;
  }>(
    getDb(),
    sql`select qr_public_config, municipal_registry_number from pets where id = ${petId}`,
  );

  return {
    config: parseQrPublicConfig(data?.qr_public_config),
    registroMunicipal: data?.municipal_registry_number ?? null,
  };
}

export async function getVaccinations(petId: string) {
  const data = await query<Tables<"vaccinations">>(
    getDb(),
    sql`select * from vaccinations where pet_id = ${petId} order by applied_at desc`,
  );

  return data.map((row) => toVaccination(row));
}

export async function getAntiparasitics(petId: string) {
  const data = await query<Tables<"dewormings">>(
    getDb(),
    sql`select * from dewormings where pet_id = ${petId} order by applied_at desc`,
  );

  return data.map(toAntiparasitic);
}

export async function getMedications(petId: string) {
  const data = await query<Tables<"medications">>(
    getDb(),
    sql`select * from medications where pet_id = ${petId} order by start_date desc nulls last`,
  );

  return data.map(toMedication);
}

export async function getConditions(petId: string) {
  const data = await query<Tables<"conditions">>(
    getDb(),
    sql`select * from conditions where pet_id = ${petId} order by diagnosed_at desc nulls last`,
  );

  return data.map(toCondition);
}

/** El gráfico de peso se lee de izquierda a derecha: acá van en orden ascendente. */
export async function getWeightEntries(petId: string) {
  const data = await query<Tables<"weight_records">>(
    getDb(),
    sql`select * from weight_records where pet_id = ${petId} order by recorded_at asc`,
  );

  return data.map(toWeightEntry);
}

export async function getDocuments(petId: string) {
  const data = await query<Tables<"pet_documents">>(
    getDb(),
    sql`select * from pet_documents where pet_id = ${petId} order by date desc`,
  );

  return data.map(toPetDocument);
}

export async function getNotes(petId: string) {
  const data = await query<Tables<"pet_notes">>(
    getDb(),
    sql`select * from pet_notes where pet_id = ${petId} order by created_at desc`,
  );

  return data.map(toPetNote);
}

/**
 * Historia clínica: en esta fase el dueño solo la lee. La escribe el veterinario
 * al cerrar una atención, y hasta entonces esta consulta devuelve vacío.
 */
export async function getConsultations(petId: string) {
  const data = await query<Tables<"medical_records">>(
    getDb(),
    sql`select * from medical_records where pet_id = ${petId} and is_draft = false order by date desc`,
  );

  return data.map((row) => ({
    id: row.id,
    petId: row.pet_id,
    fecha: row.date,
    tipo: row.type,
    veterinario: "",
    veterinaria: "",
    diagnostico: row.diagnosis ?? "",
    observaciones: row.observations ?? "",
    firmaDigital: row.is_signed,
  }));
}

/**
 * Visitas de la mascota.
 *
 * Salen de `visits` (la cola de la sala de espera, migración 008), no de la
 * historia clínica: `medical_records` solo tiene fila cuando el veterinario
 * cierra una consulta formal, así que una visita en curso o retirada nunca
 * aparecía en la pantalla. `visits` es la fuente real de "qué le está
 * pasando a esta mascota ahora", con o sin consulta formal detrás.
 */
export async function getVisits(petId: string): Promise<Visit[]> {
  const data = await query<VisitRow>(
    getDb(),
    sql`${VISIT_SELECT} where v.pet_id = ${petId} order by v.checked_in_at desc`,
  );

  return data.map(toVisit);
}

export async function getReminders(petId: string): Promise<Reminder[]> {
  const data = await query<Tables<"reminders">>(
    getDb(),
    sql`select * from reminders where pet_id = ${petId} order by scheduled_at asc`,
  );

  return data.map(toReminder);
}
