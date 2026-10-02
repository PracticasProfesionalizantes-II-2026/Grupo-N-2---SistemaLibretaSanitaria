import {
  fechaArgentina,
  hoyArgentina,
  horaArgentina,
} from "@/lib/argentina-time";
import type { Database } from "@/types/supabase";
import type {
  Reminder,
  ReminderRepeat,
  ReminderStatus,
} from "@/types/schedule";
import type {
  Antiparasitic,
  Condition,
  HealthStatus,
  Medication,
  Pet,
  PetDocument,
  PetNote,
  RecordSource,
  Sex,
  Species,
  VaccineStatus,
  Vaccination,
  WeightEntry,
} from "@/types/pet";

/**
 * Traducción entre la base y el dominio.
 *
 * La base habla inglés porque es vocabulario de PostgreSQL; la aplicación habla
 * castellano porque es el idioma del producto y esos nombres se ven en pantalla.
 * Todo el cruce pasa por acá: ningún componente conoce una columna.
 *
 * Acá también se **derivan** los campos que el mock traía escritos a mano. El
 * estado sanitario de una mascota no es un dato que alguien carga: es el
 * resultado de mirar sus vacunas contra la fecha de hoy. Tenerlo como columna
 * habría garantizado que algún día diga "al día" sobre una vacuna vencida.
 */

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** Días antes del vencimiento en los que una dosis ya se muestra como próxima. */
const DIAS_AVISO = 30;

// Día calendario argentino: `toISOString()` es UTC y desde las 21:00 ya es "mañana".
const hoy = () => hoyArgentina();

function diasHasta(fecha: string) {
  const ms =
    new Date(`${fecha}T00:00:00Z`).getTime() -
    new Date(`${hoy()}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

const ESPECIE: Record<Row<"pets">["species"], Species> = {
  dog: "perro",
  cat: "gato",
  other: "otro",
};

const SEXO: Record<NonNullable<Row<"pets">["sex"]>, Sex> = {
  male: "macho",
  female: "hembra",
};

const DB_ESPECIE = { perro: "dog", gato: "cat", otro: "other" } as const;
const DB_SEXO = { macho: "male", hembra: "female" } as const;

export const toDbSpecies = (especie: Species) => DB_ESPECIE[especie];
export const toDbSex = (sexo: Sex) => DB_SEXO[sexo];

/** Verificado por un profesional, o cargado por el dueño de memoria. */
const origen = (verified: boolean): RecordSource =>
  verified ? "veterinario" : "dueno";

/**
 * `review_status` ya está en `types/supabase.ts` (migración 043, aplicada) —
 * la columna real es `TEXT` sin un `CREATE TYPE` propio, así que el generador
 * la tipa como `string` liso, no como el literal que exige acá. El `CHECK`
 * de la 043 ya garantiza que el valor real es uno de estos cuatro; acá solo
 * se lo compara, no hace falta angostar el tipo con un cast.
 *
 * Traduce `review_status` al dominio. Solo "pending" y "rejected" importan
 * para la UI: "verified" ya es indistinguible de una dosis cargada por el
 * veterinario (`origen` manda), y "not_applicable" es toda carga manual del
 * dueño fuera de una campaña, que sigue mostrando únicamente `UnverifiedChip`.
 */
function revision(
  reviewStatus: string | null | undefined,
): Vaccination["revision"] {
  if (reviewStatus === "pending") return "pendiente";
  if (reviewStatus === "rejected") return "rechazada";
  return undefined;
}

/**
 * Estado de una dosis. Sin próxima fecha se considera aplicada y punto: hay
 * vacunas que no llevan refuerzo, y marcarlas como "vencidas" sería alarmar por
 * algo que no hay que hacer.
 */
export function vaccineStatus(nextDoseAt: string | null): VaccineStatus {
  if (!nextDoseAt) return "aplicada";

  const dias = diasHasta(nextDoseAt);
  if (dias < 0) return "vencida";
  if (dias <= DIAS_AVISO) return "proxima";

  return "aplicada";
}

/**
 * Estado sanitario de la mascota: manda la peor de sus vacunas. Una vencida
 * pinta todo de rojo aunque el resto esté al día, porque es lo que el municipio
 * va a mirar y lo que le puede impedir entrar a una guardería.
 *
 * **Sin ninguna vacuna cargada devuelve `"sin-datos"`, no `"al-dia"`.** Antes
 * devolvía `"al-dia"`, y no por descuido sino por cómo estaba escrito: una
 * lista vacía no contiene ninguna vencida ni ninguna próxima, así que caía en
 * el `return` final. La ausencia de evidencia se leía como evidencia de
 * ausencia de problemas.
 *
 * Dónde dolía de verdad: la ficha pública del collar muestra este semáforo a
 * cualquiera que escanee la chapita. Una mascota sin una sola dosis cargada le
 * decía "Al día" en verde a la persona que la acaba de encontrar — y esa
 * pantalla existe, entre otras cosas, para decidir qué hacer después de una
 * mordedura.
 *
 * Ojo con lo que NO cambia: una mascota con vacunas cargadas pero ninguna con
 * refuerzo pendiente sigue siendo `"al-dia"`. Ahí sí hay evidencia; hay vacunas
 * que no llevan próxima dosis y marcarlas como algo peor sería el error opuesto.
 */
export function healthStatus(
  vacunas: Pick<Row<"vaccinations">, "next_dose_at">[],
): HealthStatus {
  if (vacunas.length === 0) return "sin-datos";

  const estados = vacunas.map((v) => vaccineStatus(v.next_dose_at));

  if (estados.includes("vencida")) return "vencida";
  if (estados.includes("proxima")) return "por-vencer";

  return "al-dia";
}

// ------------------------------------------------------------------ mascota

export function toPet(
  row: Row<"pets">,
  extras: { estadoSanitario?: HealthStatus; veterinariaCabecera?: string } = {},
): Pet {
  return {
    id: row.id,
    nombre: row.name,
    especie: ESPECIE[row.species],
    raza: row.breed ?? "",
    sexo: row.sex ? SEXO[row.sex] : "macho",
    fechaNacimiento: row.date_of_birth ?? "",
    pesoKg: row.weight ? Number(row.weight) : 0,
    color: row.color ?? "",
    castrado: row.neutered,
    microchip: row.microchip_number ?? undefined,
    tipoSangre: row.blood_type ?? undefined,
    veterinariaCabecera: extras.veterinariaCabecera,
    // `"sin-datos"` y no `"al-dia"` por el mismo motivo que `healthStatus`:
    // este default corre cuando quien llama NO calculó el estado, así que
    // afirmar que está al día sería inventar sobre una cuenta que ni se hizo.
    estadoSanitario: extras.estadoSanitario ?? "sin-datos",
    qrCode: row.qr_code,
    fotoUrl: row.photo_url ?? undefined,
  };
}

// -------------------------------------------------------------------- salud

export function toVaccination(
  row: Row<"vaccinations">,
  lugar = "",
): Vaccination {
  return {
    id: row.id,
    petId: row.pet_id,
    vacuna: row.vaccine_name,
    dosis: row.dose_number ?? "",
    fechaAplicacion: row.applied_at,
    proximaDosis: row.next_dose_at ?? undefined,
    lugar: row.location ?? lugar,
    veterinario: undefined,
    estado: vaccineStatus(row.next_dose_at),
    origen: origen(row.verified),
    revision: revision(row.review_status),
  };
}

/**
 * El dominio distingue "interno" y "externo"; la base agrega "both", que es lo
 * que trae la mayoría de las pipetas. Se muestra como externo, que es la parte
 * que el dueño ve y aplica.
 */
export function toAntiparasitic(row: Row<"dewormings">): Antiparasitic {
  return {
    id: row.id,
    petId: row.pet_id,
    producto: row.product_name,
    tipo: row.type === "internal" ? "interno" : "externo",
    fecha: row.applied_at,
    proximaAplicacion: row.next_application_at ?? undefined,
    origen: origen(row.verified),
  };
}

export function toMedication(row: Row<"medications">): Medication {
  return {
    id: row.id,
    petId: row.pet_id,
    medicamento: row.name,
    dosis: row.dosage ?? "",
    frecuencia: row.frequency ?? "",
    desde: row.start_date ?? row.created_at.slice(0, 10),
    hasta: row.end_date ?? undefined,
    indicaciones: row.instructions ?? "",
    notasDueno: row.owner_notes ?? undefined,
    origen: origen(Boolean(row.prescribed_by_id)),
  };
}

export function toCondition(row: Row<"conditions">): Condition {
  return {
    id: row.id,
    petId: row.pet_id,
    nombre: row.name,
    // El dominio solo separa enfermedad de alergia; una condición crónica es una
    // enfermedad que no se va, y así la lee el veterinario.
    tipo: row.type === "allergy" ? "alergia" : "enfermedad",
    descripcion: row.description ?? "",
    fechaDiagnostico: row.diagnosed_at ?? row.created_at.slice(0, 10),
    origen: origen(Boolean(row.diagnosed_by_id)),
  };
}

export function toWeightEntry(row: Row<"weight_records">): WeightEntry {
  return {
    id: row.id,
    petId: row.pet_id,
    fecha: row.recorded_at,
    pesoKg: Number(row.value),
    nota: row.note ?? undefined,
    origen: origen(row.source === "vet"),
  };
}

const TIPO_DOC: Record<Row<"pet_documents">["type"], PetDocument["tipo"]> = {
  study: "estudio",
  prescription: "receta",
  certificate: "certificado",
  other: "otro",
};

export function toPetDocument(row: Row<"pet_documents">): PetDocument {
  return {
    id: row.id,
    petId: row.pet_id,
    titulo: row.title,
    tipo: TIPO_DOC[row.type],
    fecha: row.date,
    archivo: row.file_url,
    tamano: formatSize(row.file_size),
  };
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toPetNote(row: Row<"pet_notes">): PetNote {
  return {
    id: row.id,
    petId: row.pet_id,
    fecha: row.created_at.slice(0, 10),
    contenido: row.content,
  };
}

// ------------------------------------------------------------ recordatorios

const REPETICION: Record<Row<"reminders">["repeat"], ReminderRepeat> = {
  once: "una-vez",
  daily: "diaria",
  weekly: "semanal",
  monthly: "mensual",
  yearly: "anual",
};

const DB_REPETICION = {
  "una-vez": "once",
  diaria: "daily",
  semanal: "weekly",
  mensual: "monthly",
  anual: "yearly",
} as const;

export const toDbRepeat = (repeticion: ReminderRepeat) =>
  DB_REPETICION[repeticion];

/**
 * "Vencido" no es una columna: es que la fecha pasó y nadie lo cumplió. Guardarlo
 * en la base obligaría a un proceso que recorra la tabla cambiando estados, y
 * entre corrida y corrida diría "activo" sobre algo que ya venció.
 */
/**
 * En qué estado lo ve el dueño.
 *
 * `sent` **no** es "cumplido". Significa que el sistema ya avisó, no que la
 * persona haya hecho algo: un recordatorio de una vacuna que vence en siete días
 * se despacha apenas se genera, y mandarlo a "Cumplidos" lo escondería justo
 * cuando hay que actuar. Cumplido es solo lo que el dueño cerró a mano.
 */
function reminderStatus(row: Row<"reminders">): ReminderStatus {
  if (row.status === "dismissed") return "cumplido";

  return new Date(row.scheduled_at) < new Date() ? "vencido" : "activo";
}

/**
 * "Hace 2 horas" en vez de una fecha: lo que importa es si acaba de pasar.
 */
export function relativeTime(iso: string) {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);

  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.round(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;

  return fechaArgentina(iso);
}

export function toReminder(row: Row<"reminders">): Reminder {
  const cuando = new Date(row.scheduled_at);

  return {
    id: row.id,
    petId: row.pet_id,
    titulo: row.title,
    descripcion: row.description ?? "",
    fecha: hoyArgentina(cuando),
    hora: horaArgentina(cuando),
    repeticion: REPETICION[row.repeat],
    canales: row.channel === "both" ? ["push", "email"] : [row.channel],
    estado: reminderStatus(row),
    automatico: row.source !== "manual",
  };
}
