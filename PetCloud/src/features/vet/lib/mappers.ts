import type { Database } from "@/types/supabase";
import type { VisitPriority, VisitStatus } from "@/types/visit";
import type { VaccineApplication, VaccinePreset } from "@/types/vet";
import type { Consultation, Species } from "@/types/pet";
import { horaArgentina, hoyArgentina } from "@/lib/argentina-time";

/**
 * Traducción entre la base y el dominio del panel veterinario.
 *
 * Vale la misma regla que en el panel del dueño: la base habla inglés porque es
 * vocabulario de PostgreSQL, la aplicación habla castellano porque es el idioma
 * del producto. Ningún componente conoce una columna.
 */

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

// ------------------------------------------------------------ historia clínica

const TIPO_CONSULTA: Record<Row<"medical_records">["type"], string> = {
  checkup: "Control",
  emergency: "Urgencia",
  surgery: "Cirugía",
  vaccination: "Vacunación",
  deworming: "Desparasitación",
  other: "Consulta",
};

export type MedicalRecordRow = Row<"medical_records"> & {
  vet_institutions?: { name: string } | null;
  vet_professionals?: {
    license_number: string | null;
    profiles?: { first_name: string; last_name: string } | null;
  } | null;
};

/**
 * Un registro clínico como lo lee una persona.
 *
 * El nombre del profesional sale del perfil y no de un texto guardado en el
 * registro: si alguien corrige su apellido, la historia clínica lo acompaña en
 * lugar de conservar el que estaba escrito el día de la consulta.
 *
 * Devuelve la forma de `Consultation` (`types/pet`) más `matricula` y
 * `borrador`: así las pantallas del dueño y las del veterinario leen la misma
 * entidad, y el panel veterinario suma lo que solo a él le importa.
 */
export function toConsultation(row: MedicalRecordRow): Consultation & {
  motivo: string;
  matricula: string;
  borrador: boolean;
} {
  const perfil = row.vet_professionals?.profiles;

  return {
    id: row.id,
    petId: row.pet_id,
    fecha: row.date,
    tipo: TIPO_CONSULTA[row.type],
    motivo: row.reason ?? "",
    diagnostico: row.diagnosis ?? "",
    observaciones: row.observations ?? "",
    veterinaria: row.vet_institutions?.name ?? "",
    veterinario: perfil
      ? `${perfil.first_name} ${perfil.last_name}`.trim()
      : "",
    matricula: row.vet_professionals?.license_number ?? "",
    firmaDigital: row.is_signed,
    borrador: row.is_draft,
  };
}

export type VetConsultation = ReturnType<typeof toConsultation>;

// -------------------------------------------------------------- sala de espera

/**
 * Cinco estados en la base, cuatro en la pantalla.
 *
 * `cancelled` y `no_show` se muestran los dos como "retirada": para quien mira
 * la cola son lo mismo —esa mascota ya no está esperando— y la diferencia
 * importa para las métricas, no para el mostrador.
 */
const ESTADO: Record<Row<"visits">["status"], VisitStatus> = {
  waiting: "en-espera",
  in_progress: "en-atencion",
  completed: "atendida",
  cancelled: "retirada",
  no_show: "retirada",
};

const hora = (iso: string | null) => (iso ? horaArgentina(iso) : undefined);

export type VisitRow = Row<"visits"> & {
  pets?: { name: string } | null;
  profiles?: { first_name: string; last_name: string } | null;
  vet_institutions?: { name: string } | null;
  medical_records?: { observations: string | null } | null;
};

export function toVisit(row: VisitRow) {
  return {
    id: row.id,
    petId: row.pet_id,
    petNombre: row.pets?.name ?? "Mascota",
    duenoNombre: row.profiles
      ? `${row.profiles.first_name} ${row.profiles.last_name}`.trim()
      : "",
    veterinaria: row.vet_institutions?.name ?? "",
    fecha: hoyArgentina(row.checked_in_at),
    horaLlegada: hora(row.checked_in_at) ?? "",
    horaAtencion: row.status === "waiting" ? undefined : hora(row.updated_at),
    horaSalida: hora(row.completed_at),
    motivo: row.reason ?? "Consulta",
    prioridad: (row.is_urgent ? "urgencia" : "normal") as VisitPriority,
    estado: ESTADO[row.status],
    profesionalId: row.checked_in_by_id ?? undefined,
    // El resumen propio manda sobre el de la consulta: si alguien lo escribió al
    // cerrar, es lo que esa persona quiso dejar dicho sobre esta visita.
    resumen: row.summary ?? row.medical_records?.observations ?? undefined,
    // Sin `checked_in_by_id`, nadie del mostrador la anotó: la creó el dueño
    // solo, desde el QR de la sala de espera (`waiting_room_self_check_in`,
    // 053). `motivo` cae a "Consulta" en ambos casos (`:113`), así que sin
    // esta marca una autogestión es indistinguible de un registro de
    // mostrador con motivo genérico.
    autogestionado: row.checked_in_by_id === null,
  };
}

export type VetVisit = ReturnType<typeof toVisit>;

/**
 * El orden en que el mostrador mira la pantalla: primero quien está siendo
 * atendido, después la espera —urgencias arriba, y dentro de cada grupo por hora
 * de llegada— y al final lo ya cerrado.
 */
const ORDEN: Record<VisitStatus, number> = {
  "en-atencion": 0,
  "en-espera": 1,
  atendida: 2,
  retirada: 3,
};

export function ordenarCola(visitas: VetVisit[]) {
  return [...visitas].sort((a, b) => {
    if (ORDEN[a.estado] !== ORDEN[b.estado])
      return ORDEN[a.estado] - ORDEN[b.estado];

    if (a.estado === "en-espera" && a.prioridad !== b.prioridad)
      return a.prioridad === "urgencia" ? -1 : 1;

    return a.horaLlegada.localeCompare(b.horaLlegada);
  });
}

// ------------------------------------------------------------------- vacunas

const VIA: Record<string, string> = {
  injectable: "Inyectable",
  oral: "Oral",
  nasal: "Nasal",
  topical: "Tópica",
  other: "Otra",
};

export type VaccinationRow = Row<"vaccinations"> & {
  pets?: { name: string } | null;
};

export function toVaccineApplication(row: VaccinationRow): VaccineApplication {
  return {
    id: row.id,
    petId: row.pet_id,
    vacuna: row.vaccine_name,
    laboratorio: row.manufacturer ?? "",
    lote: row.lot_number ?? "",
    dosis: row.dose_number ?? "",
    via: row.application_route ? (VIA[row.application_route] ?? "") : "",
    fechaAplicacion: row.applied_at,
    proximaDosis: row.next_dose_at ?? undefined,
    lugar: row.location ?? "",
    profesionalId: row.applied_by_id ?? "",
  };
}

// ------------------------------------------------------------------- presets

const ESPECIE: Record<string, Species> = {
  dog: "perro",
  cat: "gato",
  other: "otro",
};

/**
 * El dominio habla en meses y la base guarda días.
 *
 * Días es lo correcto para almacenar —un refuerzo puede ser a los 21 días y "0,7
 * meses" no significa nada— pero la pantalla dice "refuerzo a los 12 meses",
 * que es como lo piensa el profesional.
 */
export function toVaccinePreset(row: Row<"vaccine_presets">): VaccinePreset {
  return {
    id: row.id,
    vacuna: row.vaccine_name,
    laboratorio: row.manufacturer ?? "",
    via: row.application_route ? (VIA[row.application_route] ?? "") : "",
    dosisPorDefecto: row.default_dose_number ?? "",
    intervaloMeses: row.booster_interval_days
      ? Math.round(row.booster_interval_days / 30)
      : 12,
    especies: (row.species ?? []).map((s) => ESPECIE[s] ?? "otro"),
    obligatoria: row.is_mandatory,
  };
}
