import { toPet } from "@/features/owner/lib/mappers";
import type { Database } from "@/types/supabase";
import type { Patient, PatientOwner } from "@/types/vet";

/**
 * La mascota del dueño, vista como paciente.
 *
 * `Patient` es `Pet & { ownerId }`: la misma entidad con el dueño al lado. Por
 * eso reusa `toPet` del panel del dueño en vez de traducir las columnas otra
 * vez — es el principio que el README llama "los paneles comparten las
 * entidades, no las copian", y es lo que evita que las dos pantallas terminen
 * contando cosas distintas de la misma mascota.
 *
 * El estado sanitario queda en "al-dia" cuando la consulta no trae las vacunas.
 * Quien lo necesite pinta, como la tabla de pacientes, las pide explícitamente.
 */
type PetRow = Database["public"]["Tables"]["pets"]["Row"] & {
  profiles?: {
    first_name: string;
    last_name: string;
    phone: string | null;
    address: string | null;
  } | null;
  vaccinations?: { next_dose_at: string | null }[] | null;
};

export function toPatient(row: PetRow): Patient {
  // `toPet` lee columna por columna, así que las relaciones que trae la consulta
  // (`profiles`, `vaccinations`) le pasan al lado sin necesidad de quitarlas.
  return {
    ...toPet(row),
    ownerId: row.owner_id,
  };
}

export function toPatientOwner(row: PetRow): PatientOwner | null {
  if (!row.profiles) return null;

  return {
    id: row.owner_id,
    nombre: `${row.profiles.first_name} ${row.profiles.last_name}`.trim(),
    // `profiles` no tiene DNI. La pantalla lo muestra como dato del padrón
    // municipal, así que va vacío hasta que exista esa columna — inventar un
    // documento en un registro sanitario sería peor que no mostrarlo.
    dni: "",
    // El email vive en `auth.users` y no se expone acá: para contactar al dueño
    // por una atención alcanza con el teléfono, y así el panel no se convierte
    // en un listado de correos.
    email: "",
    telefono: row.profiles.phone ?? "",
    direccion: row.profiles.address ?? "",
  };
}
