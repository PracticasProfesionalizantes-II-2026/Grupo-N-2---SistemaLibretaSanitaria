"use server";

import "server-only";

import { sql } from "drizzle-orm";

import { requireUser } from "@/features/auth/lib/current-user";
import { getDb, query } from "@/lib/db";
import { storageUrl } from "@/lib/storage";
import type { Tables } from "@/types/database";
import {
  toAntiparasitic,
  toMedication,
  toVaccination,
} from "@/features/owner/lib/mappers";
import { getPet } from "@/features/owner/data/pet-queries";
import type { Antiparasitic, Medication, Pet, Vaccination } from "@/types/pet";

/**
 * Los datos de la libreta sanitaria, para armar el PDF.
 *
 * El documento se arma en el navegador; acá solo se junta lo que va adentro. La
 * división no es caprichosa: el PDF necesita las imágenes de las firmas, y esas
 * se descargan con URLs firmadas que caducan. Emitirlas en el servidor y
 * dejarlas viajar en el payload es más simple que abrir un endpoint por firma.
 *
 * Todo lo que sale de acá ya pasó por RLS con la sesión del dueño: si la mascota
 * no es suya, `getPet` devuelve nada y no hay libreta que armar.
 */

type LibretaConsulta = {
  id: string;
  fecha: string;
  tipo: string;
  motivo: string;
  diagnostico: string;
  observaciones: string;
  veterinario: string;
  /**
   * La matrícula que quedó congelada en la firma con la que se firmó esta
   * consulta. Para lo firmado antes de la 063 no hay firma congelada y cae en
   * la del profesional, que es lo único que existe de ese acto.
   */
  matricula: string;
  veterinaria: string;
  /**
   * La aclaración de la firma congelada, que es el nombre con el que se firmó.
   * `null` para lo firmado antes de la 063.
   */
  aclaracion: string | null;
  /** URL temporal de la imagen de la firma. Null si el profesional no cargó una. */
  firmaUrl: string | null;
};

export type LibretaData = {
  mascota: Pet;
  dueno: { nombre: string; telefono: string; email: string };
  vacunas: Vaccination[];
  antiparasitarios: Antiparasitic[];
  medicacion: Medication[];
  consultas: LibretaConsulta[];
  generadaEl: string;
};

const TIPO: Record<string, string> = {
  checkup: "Control",
  emergency: "Urgencia",
  surgery: "Cirugía",
  vaccination: "Vacunación",
  deworming: "Desparasitación",
  other: "Consulta",
};

/** Una hora alcanza de sobra para armar un PDF y no deja el enlace dando vueltas. */

export async function getLibretaData(
  petId: string,
): Promise<LibretaData | null> {
  const user = await requireUser();

  // `getPet` acota a las mascotas del usuario: es la puerta de esta lectura.
  const mascota = await getPet(petId);
  if (!mascota) return null;

  const db = getDb();
  type Registro = Tables<"medical_records"> & {
    institucion: string | null;
    firma_path: string | null;
    firma_aclaracion: string | null;
    firma_matricula: string | null;
    vet_matricula: string | null;
    vet_nombre: string | null;
  };

  const [[perfil], vacunas, antiparasitarios, medicacion, registros] =
    await Promise.all([
      query<{ first_name: string; last_name: string; phone: string | null }>(
        db,
        sql`select first_name, last_name, phone from profiles where id = ${user.id}`,
      ),
      query<Tables<"vaccinations">>(
        db,
        sql`select * from vaccinations where pet_id = ${petId} order by applied_at desc`,
      ),
      query<Tables<"dewormings">>(
        db,
        sql`select * from dewormings where pet_id = ${petId} order by applied_at desc`,
      ),
      query<Tables<"medications">>(
        db,
        sql`select * from medications where pet_id = ${petId}
             order by start_date desc nulls last`,
      ),
      query<Registro>(
        db,
        sql`select m.*, i.name as institucion, s.image_path as firma_path,
                   s.clarification as firma_aclaracion,
                   s.license_number as firma_matricula,
                   vp.license_number as vet_matricula,
                   trim(p.first_name || ' ' || p.last_name) as vet_nombre
              from medical_records m
              left join vet_institutions i on i.id = m.institution_id
              left join vet_signatures s on s.id = m.signature_id
              left join vet_professionals vp on vp.id = m.vet_professional_id
              left join profiles p on p.id = vp.profile_id
             where m.pet_id = ${petId} and m.is_signed
             order by m.date desc`,
      ),
    ]);

  const consultas: LibretaConsulta[] = [];

  for (const row of registros) {
    consultas.push({
      id: row.id,
      fecha: row.date,
      tipo: TIPO[row.type] ?? "Consulta",
      motivo: row.reason ?? "",
      diagnostico: row.diagnosis ?? "",
      observaciones: row.observations ?? "",
      veterinario: row.vet_nombre ?? "",
      matricula: row.firma_matricula ?? row.vet_matricula ?? "",
      veterinaria: row.institucion ?? "",
      aclaracion: row.firma_aclaracion,
      firmaUrl: row.firma_path
        ? storageUrl("vet-signatures", row.firma_path)
        : null,
    });
  }

  return {
    mascota,
    dueno: {
      nombre: perfil ? `${perfil.first_name} ${perfil.last_name}`.trim() : "",
      telefono: perfil?.phone ?? "",
      email: user.email,
    },
    vacunas: vacunas.map((row) => toVaccination(row)),
    antiparasitarios: antiparasitarios.map(toAntiparasitic),
    medicacion: medicacion.map(toMedication),
    consultas,
    generadaEl: new Date().toISOString(),
  };
}
