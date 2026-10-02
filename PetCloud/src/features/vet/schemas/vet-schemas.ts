import { z } from "zod";

const required = "Este campo es obligatorio";

/** Vías de administración que ofrece el formulario de tratamiento. */
export const TREATMENT_TYPES = [
  "Inyectable",
  "Comprimido / píldora",
  "Jarabe / suspensión",
  "Tópico",
  "Pipeta",
  "Colirio",
  "Otro",
];

export const CONSULTATION_TYPES = [
  { value: "control", label: "Control" },
  { value: "urgencia", label: "Urgencia" },
  { value: "cirugia", label: "Cirugía" },
  { value: "vacunacion", label: "Vacunación" },
  { value: "otro", label: "Otro" },
] as const;

/**
 * Frecuencias de administración predefinidas.
 * Salieron del feedback del veterinario: escribirla a mano en cada receta era
 * la parte más lenta de la carga.
 */
export const TREATMENT_FREQUENCIES = [
  "Cada 8 horas",
  "Cada 12 horas",
  "Cada 24 horas",
  "Cada 48 horas",
  "2 veces por semana",
  "1 vez por semana",
  "1 vez por mes",
  "Dosis única",
];

export const treatmentSchema = z.object({
  medicamento: z.string().min(1, required),
  cantidad: z.string().min(1, required),
  tipo: z.string().min(1, "Elegí el tipo"),
  frecuencia: z.string().min(1, "Elegí la frecuencia"),
  duracion: z.string().min(1, required),
  indicaciones: z.string().optional(),
});

export type TreatmentValues = z.infer<typeof treatmentSchema>;

export const consultationSchema = z
  .object({
    fecha: z.string().min(1, required),
    hora: z.string().min(1, required),
    tipo: z.enum(["control", "urgencia", "cirugia", "vacunacion", "otro"], {
      message: "Elegí el tipo de consulta",
    }),
    motivo: z.string().min(1, required),
    diagnostico: z.string().min(1, required),
    observaciones: z.string().optional(),
    // Se registra con `valueAsNumber`: un campo vacío llega como NaN y cae acá.
    pesoKg: z
      .number({ message: "Ingresá un número" })
      .positive("El peso debe ser mayor a 0"),
    proximoControl: z.string().optional(),
    // Bloque de tratamiento: opcional en conjunto, pero coherente si se empieza.
    medicamento: z.string().optional(),
    cantidad: z.string().optional(),
    tipoMedicamento: z.string().optional(),
    frecuencia: z.string().optional(),
    duracion: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.medicamento?.trim()) return;

    const missing = [
      ["cantidad", values.cantidad],
      ["frecuencia", values.frecuencia],
      ["duracion", values.duracion],
    ] as const;

    missing.forEach(([field, value]) => {
      if (!value?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Completá este dato para indicar el medicamento",
        });
      }
    });
  });

export type ConsultationValues = z.infer<typeof consultationSchema>;

export const vaccinationSchema = z.object({
  vacuna: z.string().min(1, "Elegí la vacuna"),
  laboratorio: z.string().min(1, "Elegí el laboratorio"),
  lote: z
    .string()
    .min(1, "El nº de lote es obligatorio para el reporte municipal"),
  dosis: z.string().min(1, "Elegí la dosis"),
  via: z.string().min(1, "Elegí la vía de aplicación"),
  fechaAplicacion: z.string().min(1, required),
  proximaDosis: z.string().min(1, required),
  lugar: z.string().min(1, required),
  // Sin `profesionalId`: aplica quien tiene la sesión abierta. Un campo exigido
  // por el schema que ningún input completa deja el formulario sin enviar y sin
  // error visible, porque el mensaje se dirige a algo que ya no se renderiza.
});

export type VaccinationValues = z.infer<typeof vaccinationSchema>;

/**
 * Preset del catálogo de vacunas de la institución.
 *
 * A diferencia de `vaccinationSchema`, acá no hay dato que se complete "en el
 * momento": todos los campos son obligatorios porque son justamente los
 * valores que el modo campaña y la carga de vacunación van a reusar sin
 * pedirlos de nuevo.
 */
export const vaccinePresetSchema = z.object({
  vacuna: z.string().min(1, required),
  laboratorio: z.string().min(1, "Elegí el laboratorio"),
  via: z.string().min(1, "Elegí la vía de aplicación"),
  dosisPorDefecto: z.string().min(1, "Elegí la dosis"),
  intervaloMeses: z
    .number({ message: "Ingresá un número" })
    .int("El intervalo se expresa en meses enteros")
    .positive("El intervalo debe ser mayor a 0"),
  especies: z
    .array(z.enum(["perro", "gato", "otro"]))
    .min(1, "Elegí al menos una especie"),
  obligatoria: z.boolean(),
});

export type VaccinePresetValues = z.infer<typeof vaccinePresetSchema>;

/**
 * Turnos (migración 041, `appointments`).
 *
 * A diferencia de `consultationSchema` (que separa `fecha`+`hora` porque esa
 * tabla también los guarda en columnas separadas), acá la columna es una sola
 * `starts_at TIMESTAMPTZ`: quien arma el formulario decide cómo combina fecha
 * y hora en un único ISO, y este schema valida el resultado ya fusionado —
 * no dos campos sueltos que alguien más adelante tiene que combinar antes de
 * escribir en la base. `duracionMin` repite el rango de la columna
 * (`duration_min BETWEEN 5 AND 480`, migración 041): el error tiene que
 * llegar en el formulario, no como un mensaje de PostgreSQL.
 *
 * Reemplaza el `appointmentSchema` original (huérfano: nada lo usaba salvo su
 * propio test), de cuando todavía no existía la tabla `appointments` ni la
 * decisión de fusionar fecha y hora en un solo timestamp (diseño D9).
 */
function fechaHoraValida(mensaje: string) {
  return z
    .string()
    .min(1, mensaje)
    .refine(
      (valor) => !Number.isNaN(new Date(valor).getTime()),
      "La fecha y el horario no son válidos",
    );
}

export const appointmentSchema = z.object({
  petId: z.string().min(1, "Elegí el paciente"),
  startsAt: fechaHoraValida("Elegí la fecha y el horario"),
  duracionMin: z
    .number({ message: "Elegí la duración" })
    .int("La duración se expresa en minutos enteros")
    .min(5, "El turno dura al menos 5 minutos")
    .max(480, "El turno dura como mucho 8 horas"),
  profesionalId: z.string().min(1, "Elegí el profesional"),
  motivo: z.string().min(1, required),
  notasInternas: z.string().optional(),
});

export type AppointmentValues = z.infer<typeof appointmentSchema>;

/**
 * Reprogramar: lo único que cambia es cuándo, y opcionalmente cuánto dura.
 * Paciente, profesional y motivo se editan (si hace falta) por otro lado.
 */
export const appointmentRescheduleSchema = z.object({
  startsAt: fechaHoraValida("Elegí la nueva fecha y horario"),
  duracionMin: z
    .number({ message: "Elegí la duración" })
    .int("La duración se expresa en minutos enteros")
    .min(5, "El turno dura al menos 5 minutos")
    .max(480, "El turno dura como mucho 8 horas")
    .optional(),
});

export type AppointmentRescheduleValues = z.infer<
  typeof appointmentRescheduleSchema
>;

/**
 * Alta rápida desde el mostrador: los datos mínimos para poder atender.
 * El resto del perfil lo completa el dueño cuando activa su cuenta.
 */
export const newPatientSchema = z.object({
  nombre: z.string().min(1, required),
  especie: z.enum(["perro", "gato", "otro"], { message: "Elegí una especie" }),
  raza: z.string().min(1, required),
  sexo: z.enum(["macho", "hembra"], { message: "Elegí el sexo" }),
  fechaNacimiento: z.string().min(1, required),
  pesoKg: z
    .number({ message: "Ingresá un número" })
    .positive("El peso debe ser mayor a 0"),
  duenoNombre: z.string().min(1, required),
  duenoDni: z.string().min(1, required),
  duenoTelefono: z.string().min(1, required),
  duenoEmail: z.email("Ingresá un email válido"),
});

export type NewPatientValues = z.infer<typeof newPatientSchema>;

/**
 * Coordenada opcional, coercida a `null` cuando llega vacía.
 *
 * El input HTML manda `""` cuando está en blanco, nunca `undefined`: sin esta
 * coerción `z.number().optional()` rechazaría el string vacío en vez de
 * tratarlo como "no cargado todavía", que es lo que significa acá.
 */
function coordenadaOpcional(min: number, max: number, mensaje: string) {
  return z
    .union([z.literal(""), z.number({ message: mensaje })])
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor))
    .pipe(z.number().min(min, mensaje).max(max, mensaje).optional());
}

/**
 * Sin ciudad ni email: `vet_institutions` no tiene esas columnas, así que el
 * formulario los pedía para tirarlos. Un campo que se completa y no se guarda es
 * peor que un campo que no está — la persona cree que quedó registrado.
 *
 * `latitud`/`longitud` son opcionales y van de a pares: la migración 055 tiene
 * el mismo CHECK (`ambas o ninguna`) en la base, y este `superRefine` lo
 * adelanta al formulario para que el error aparezca antes del viaje al
 * servidor, no como un mensaje crudo de PostgreSQL.
 */
export const clinicSchema = z
  .object({
    nombre: z.string().min(1, required),
    direccion: z.string().min(1, required),
    telefono: z.string().min(1, required),
    web: z.string().optional(),
    latitud: coordenadaOpcional(-90, 90, "La latitud va de -90 a 90"),
    longitud: coordenadaOpcional(-180, 180, "La longitud va de -180 a 180"),
  })
  .superRefine((values, ctx) => {
    const tieneLat = values.latitud !== undefined;
    const tieneLng = values.longitud !== undefined;

    if (tieneLat === tieneLng) return;

    const campoFaltante = tieneLat ? "longitud" : "latitud";
    ctx.addIssue({
      code: "custom",
      path: [campoFaltante],
      message: "Cargá las dos coordenadas, o ninguna",
    });
  });

export type ClinicValues = z.infer<typeof clinicSchema>;
