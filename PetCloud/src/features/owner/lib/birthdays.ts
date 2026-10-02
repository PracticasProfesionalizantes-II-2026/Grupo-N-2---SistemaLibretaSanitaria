import type { Pet } from "@/types/pet";

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

/**
 * Month and day of `now` as seen in Argentina, whatever the runtime's zone.
 *
 * The server renders in UTC: between 21:00 and 24:00 Argentine time it is
 * already "tomorrow" there, so `now.getDate()` would celebrate a day early.
 */
function mesYDiaEnArgentina(now: Date) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_ARGENTINA,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);

  const valor = (tipo: string) =>
    Number(partes.find((parte) => parte.type === tipo)?.value);

  return { anio: valor("year"), mes: valor("month"), dia: valor("day") };
}

function listarNombres(nombres: string[]) {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}

/** Banner title: singular for one pet, plural with "a, b y c" for several. */
export function tituloDeCumpleanos(nombres: string[]) {
  if (nombres.length === 0) return "";

  const lista = listarNombres(nombres);
  return nombres.length === 1
    ? `¡Hoy es el cumpleaños de ${lista}! 🎂🎉`
    : `¡Hoy cumplen años ${lista}! 🎂🎉`;
}

function esBisiesto(anio: number) {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/**
 * Pets whose birthday is today in Argentina.
 *
 * `fechaNacimiento` is a date-only "YYYY-MM-DD" string (or `""` when the pet
 * has none — see the mappers), so it is compared field by field and never
 * passed through `new Date()`, which would shift it by the UTC offset.
 * A pet born on February 29 celebrates on February 28 in non-leap years.
 */
export function mascotasQueCumplenHoy<T extends Pick<Pet, "fechaNacimiento">>(
  pets: T[],
  now: Date = new Date(),
): T[] {
  const hoy = mesYDiaEnArgentina(now);

  return pets.filter((pet) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pet.fechaNacimiento ?? "");
    if (!match) return false;

    const mes = Number(match[2]);
    let dia = Number(match[3]);
    if (mes === 2 && dia === 29 && !esBisiesto(hoy.anio)) dia = 28;

    return mes === hoy.mes && dia === hoy.dia;
  });
}
