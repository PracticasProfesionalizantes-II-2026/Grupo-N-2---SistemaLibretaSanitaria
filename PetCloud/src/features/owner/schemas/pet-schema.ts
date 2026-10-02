import { z } from "zod";

import { hoyArgentina } from "@/lib/argentina-time";

const required = "Este campo es obligatorio";

/**
 * Letras (con acentos/ñ), espacios, apóstrofes, puntos y guiones: cubre
 * nombres reales ("O'Malley", "Café con Leche", "Bella-Luna") sin permitir
 * basura como "d/&&". `\p{L}`/`\p{M}` en vez de `[a-zA-Z]` para no romper con
 * acentos o ñ.
 */
const NOMBRE_REGEX = /^[\p{L}\p{M}\s'.-]+$/u;

/**
 * ISO 11784/11785: el microchip de mascota son exactamente 15 dígitos. Antes se
 * aceptaban de 9 a 15 y quedaron fichas con números más cortos: esas se
 * respetan tal cual (ver `LegadoMascota`), pero todo valor nuevo o cambiado
 * tiene que ser de 15.
 */
const MICROCHIP_REGEX = /^\d{15}$/;

/** Quien lo copia de la libreta suele separarlo en grupos: los espacios no cuentan. */
export function normalizarMicrochip(valor: string | undefined | null): string {
  return (valor ?? "").replace(/\s+/g, "");
}

/**
 * Tipos de sangre que se ofrecen por especie. Perro: el sistema DEA 1.1, que es
 * el que se tipifica en la práctica antes de una transfusión. Gato: AB. Para
 * "otro" no hay una lista razonable, así que solo existe "No sé" (NULL).
 */
export const tiposSangrePorEspecie: Record<
  "perro" | "gato" | "otro",
  string[]
> = {
  perro: ["DEA 1.1 positivo", "DEA 1.1 negativo"],
  gato: ["A", "B", "AB"],
  otro: [],
};

/**
 * Valores que la mascota ya tenía guardados antes de las reglas nuevas. Se
 * aceptan **sin cambios** al editar: si no, abrir una ficha vieja para
 * corregir el color bloqueaba el guardado por un microchip de 10 dígitos o un
 * tipo de sangre escrito a mano años atrás.
 */
export type LegadoMascota = {
  microchip?: string | null;
  tipoSangre?: string | null;
};

/**
 * Microchip y tipo de sangre dependen de valores previos (y el tipo de sangre,
 * de la especie), así que se validan a nivel objeto y no campo por campo.
 */
function validarChipYSangre(legado: LegadoMascota = {}) {
  return (
    valores: {
      especie: "perro" | "gato" | "otro";
      microchip?: string;
      tipoSangre?: string;
    },
    ctx: z.RefinementCtx,
  ) => {
    const chip = normalizarMicrochip(valores.microchip);
    const chipLegado = normalizarMicrochip(legado.microchip);
    if (chip && chip !== chipLegado && !MICROCHIP_REGEX.test(chip)) {
      ctx.addIssue({
        code: "custom",
        path: ["microchip"],
        message: "El microchip son exactamente 15 números",
      });
    }

    const sangre = valores.tipoSangre?.trim() ?? "";
    const permitidos = tiposSangrePorEspecie[valores.especie] ?? [];
    if (
      sangre &&
      sangre !== (legado.tipoSangre?.trim() ?? "") &&
      !permitidos.includes(sangre)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["tipoSangre"],
        message: "Elegí un tipo de sangre de la lista",
      });
    }
  };
}

/** Ninguna mascota registrada hoy puede haber nacido hace más de 40 años. */
const MIN_FECHA_NACIMIENTO = "1985-01-01";

/**
 * Nombre de mascota. Se recorta antes de validar y exige al menos una letra:
 * sin eso "   " o "..." pasaban la regex (todo espacios o puntos) y quedaban
 * como nombre.
 */
export const nombreMascotaSchema = z
  .string()
  .trim()
  .min(1, required)
  .max(60, "El nombre no puede superar los 60 caracteres")
  .regex(NOMBRE_REGEX, "El nombre solo puede tener letras, espacios y - . '")
  .regex(/\p{L}/u, "El nombre tiene que tener al menos una letra");

/**
 * Fecha de nacimiento `YYYY-MM-DD`. El tope ("hoy") se calcula **al validar**,
 * no al cargar el módulo: antes era una constante de módulo y un servidor (o
 * una pestaña) que llevaba días arriba seguía usando el "hoy" del arranque. Y
 * es el hoy de Argentina, no el de UTC, para que navegador y servidor
 * coincidan después de las 21:00.
 */
export const fechaNacimientoSchema = z
  .string()
  .min(1, required)
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresá una fecha válida")
  .refine(
    (fecha) => fecha <= hoyArgentina(),
    "La fecha de nacimiento no puede ser posterior a hoy",
  )
  .refine(
    (fecha) => fecha >= MIN_FECHA_NACIMIENTO,
    "Revisá la fecha de nacimiento, parece demasiado antigua",
  );

// Se registra con `valueAsNumber`: un campo vacío llega como NaN y cae en este mensaje.
// 100 kg es un techo generoso: cubre incluso las razas gigantes más pesadas
// con margen, sin permitir valores como "156.5" para un mestizo.
const pesoKgSchema = z
  .number({ message: "Ingresá un número" })
  .positive("El peso debe ser mayor a 0")
  .max(100, "Revisá el peso, no puede superar los 100 kg");

// El formato se valida en `validarChipYSangre`: depende del valor previo.
const microchipSchema = z.string().max(40, "Revisá el microchip").optional();

const petFormBase = z.object({
  nombre: nombreMascotaSchema,
  especie: z.enum(["perro", "gato", "otro"], { message: "Elegí una especie" }),
  raza: z.string().min(1, required),
  fechaNacimiento: fechaNacimientoSchema,
  sexo: z.enum(["macho", "hembra"], { message: "Elegí el sexo" }),
  pesoKg: pesoKgSchema,
  color: z.string().max(60, "Máximo 60 caracteres").optional(),
  castrado: z.boolean(),
  microchip: microchipSchema,
  tipoSangre: z.string().max(30, "Máximo 30 caracteres").optional(),
  veterinariaCabecera: z.string().max(80, "Máximo 80 caracteres").optional(),
});

/** Schema del formulario; con `legado` acepta sin cambios los valores viejos de esa ficha. */
export function crearPetFormSchema(legado?: LegadoMascota) {
  return petFormBase.superRefine(validarChipYSangre(legado));
}

export const petFormSchema = crearPetFormSchema();

export type PetFormValues = z.infer<typeof petFormBase>;

/**
 * Lo que `createPet`/`updatePet` revalidan del lado del servidor, con los
 * mismos validadores que el formulario. Es más permisivo en qué campos exige
 * porque el alta del onboarding (`petBasicsSchema`) no pide raza ni peso; lo
 * que sí llega se valida igual. Sin esto, cualquiera que llamara la acción sin
 * pasar por el formulario podía guardar una fecha futura o un peso negativo.
 */
const petServerBase = z.object({
  nombre: nombreMascotaSchema,
  especie: petFormBase.shape.especie,
  raza: z.string().max(80, "Máximo 80 caracteres").optional(),
  sexo: petFormBase.shape.sexo.optional(),
  fechaNacimiento: fechaNacimientoSchema.optional().or(z.literal("")),
  pesoKg: pesoKgSchema.optional(),
  color: petFormBase.shape.color,
  castrado: z.boolean().optional(),
  microchip: microchipSchema,
  tipoSangre: petFormBase.shape.tipoSangre,
});

/** Igual que en el formulario: `legado` son los valores que ya tenía la fila. */
export function crearPetServerSchema(legado?: LegadoMascota) {
  return petServerBase.superRefine(validarChipYSangre(legado));
}

export const petServerSchema = crearPetServerSchema();

/** Razas por especie: alimenta el selector dependiente del formulario de mascota. */
export const breedsBySpecies: Record<string, string[]> = {
  perro: [
    "Labrador Retriever",
    "Golden Retriever",
    "Caniche",
    "Bulldog Francés",
    "Pastor Alemán",
    "Beagle",
    "Mestizo",
    "Otra",
  ],
  gato: [
    "Siamés",
    "Persa",
    "Común europeo",
    "Maine Coon",
    "Bengalí",
    "Mestizo",
    "Otra",
  ],
  otro: ["Conejo", "Hámster", "Hurón", "Ave", "Tortuga", "Otra"],
};

/**
 * Rango habitual de peso por especie. Solo alimenta un aviso: el tope duro
 * sigue siendo el del schema (100 kg). Un Gran Danés de 85 kg o un gato de
 * 13 kg existen; se avisa para que se revise un "150" tipeado por "15,0".
 */
const rangoPesoPorEspecie: Partial<
  Record<"perro" | "gato" | "otro", { min: number; max: number }>
> = {
  perro: { min: 0.5, max: 90 },
  gato: { min: 1, max: 12 },
};

/** Texto del aviso, o `null` si el peso es habitual (o no hay rango para la especie). */
export function avisoPesoInusual(
  especie: string | undefined,
  pesoKg: number | undefined,
): string | null {
  if (!pesoKg || !Number.isFinite(pesoKg) || pesoKg <= 0) return null;
  const rango = rangoPesoPorEspecie[especie as "perro" | "gato" | "otro"];
  if (!rango) return null;
  if (pesoKg >= rango.min && pesoKg <= rango.max) return null;

  const animal = especie === "gato" ? "un gato" : "un perro";
  return `Es un peso poco habitual para ${animal} (${rango.min} a ${rango.max} kg). Revisalo antes de guardar.`;
}

/**
 * Fecha de nacimiento aproximada a partir de una edad (años + meses), contada
 * desde hoy en Argentina. Se conserva el día de hoy (recortado al último día
 * del mes si no existe, p. ej. 31 → 30). No hay columna para marcar "fecha
 * aproximada", así que se guarda como una fecha normal.
 */
export function fechaDesdeEdadAproximada(
  anios: number,
  meses: number,
  hoy: string = hoyArgentina(),
): string | null {
  if (!Number.isInteger(anios) || !Number.isInteger(meses)) return null;
  if (anios < 0 || meses < 0 || meses > 11 || anios > 40) return null;
  if (anios === 0 && meses === 0) return null;

  const [y, m, d] = hoy.split("-").map(Number);
  const totalMeses = y * 12 + (m - 1) - (anios * 12 + meses);
  const anio = Math.floor(totalMeses / 12);
  const mes = (totalMeses % 12) + 1;
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);

  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Trim, minúsculas y sin acentos: "  Firulaís " y "firulais" son el mismo nombre. */
export function normalizarNombreMascota(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** La primera mascota propia con el mismo nombre normalizado y la misma especie. */
export function buscarMascotaDuplicada<
  T extends { id: string; nombre: string; especie: string },
>(
  mascotas: T[],
  candidata: { nombre: string; especie: string },
  excluirId?: string,
): T | undefined {
  const nombre = normalizarNombreMascota(candidata.nombre);
  return mascotas.find(
    (m) =>
      m.id !== excluirId &&
      m.especie === candidata.especie &&
      normalizarNombreMascota(m.nombre) === nombre,
  );
}
