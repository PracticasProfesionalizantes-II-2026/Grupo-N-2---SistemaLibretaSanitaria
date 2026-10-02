import { hoyArgentina } from "@/lib/argentina-time";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const EDAD_DESCONOCIDA = "Edad desconocida";

/** Parsea "2026-08-14" como fecha local, sin el corrimiento de zona horaria de `new Date(iso)`. */
export function parseDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(iso: string) {
  const date = parseDate(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

export function formatLongDate(iso: string) {
  const date = parseDate(iso);
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * Edad en años y meses, redactada como la diría una persona ("2 años y 4 meses").
 *
 * Devuelve `""` cuando no hay fecha utilizable, y la defensa vive acá a
 * propósito: los mappers hacen `date_of_birth ?? ""`, o sea que convierten "no
 * hay dato" en una cadena que *parece* una fecha. Ese `""` llega hasta acá,
 * `parseDate("")` da un `Invalid Date` y las cuentas de abajo escupen
 * "NaN años y NaN meses" en pantalla. El único lugar donde se puede distinguir
 * "sin dato" de "fecha real" es justo antes de contar, así que se corta acá.
 *
 * Con una fecha que no se puede leer, o **futura**, devuelve "Edad
 * desconocida": antes una fecha futura daba edades negativas ("-1 años y 11
 * meses"). `today` por defecto es el día de Argentina, no el del proceso.
 */
export function formatAge(birthIso: string, today = parseDate(hoyArgentina())) {
  if (!birthIso) return "";

  const birth = parseDate(birthIso);
  if (Number.isNaN(birth.getTime())) return EDAD_DESCONOCIDA;
  if (birth.getTime() > today.getTime()) return EDAD_DESCONOCIDA;

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();

  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }

  if (years === 0) return `${months} ${months === 1 ? "mes" : "meses"}`;
  if (months === 0) return `${years} ${years === 1 ? "año" : "años"}`;
  return `${years} ${years === 1 ? "año" : "años"} y ${months} ${months === 1 ? "mes" : "meses"}`;
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
