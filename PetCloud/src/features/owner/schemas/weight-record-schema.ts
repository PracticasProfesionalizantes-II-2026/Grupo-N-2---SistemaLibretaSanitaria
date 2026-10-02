import { hoyArgentina } from "@/lib/argentina-time";

/**
 * Validación de la fecha de un registro de peso.
 *
 * Vive acá, y no dentro del modal, porque la misma regla la necesitan tres
 * lugares: el `<input type="date">` (que solo sugiere), el `handleSave` del
 * modal, y las server actions `addWeightRecord`/`updateWeightRecord`, que son
 * la defensa real —el cliente puede saltearse entero—. Escrita tres veces se
 * corrige en una sola y sigue rota en las otras dos.
 *
 * La cuarta copia, la que de verdad no se puede evadir, está en la base: el
 * CHECK `weight_records_no_futura` y el trigger `weight_records_fecha_plausible`
 * de la migración 052. Esta función existe para que el usuario reciba un
 * mensaje entendible antes de chocar contra el SQLSTATE 23514, no para
 * reemplazarla.
 *
 * Las fechas se comparan como strings `YYYY-MM-DD`, igual que en
 * `pet-schema.ts`: ese formato ordena lexicográficamente igual que
 * cronológicamente, así que no hace falta construir `Date` —ni lidiar con la
 * zona horaria que `new Date("2026-01-01")` interpreta como UTC y en Argentina
 * devuelve el día anterior—.
 */

export const ERROR_FECHA_REQUERIDA = "Ingresá la fecha del pesaje.";

export const ERROR_FECHA_FUTURA =
  "La fecha del pesaje no puede ser posterior a hoy.";

export function errorFechaAnteriorAlNacimiento(fechaNacimiento: string) {
  return `La fecha del pesaje no puede ser anterior al nacimiento de la mascota (${fechaNacimiento}).`;
}

/**
 * Hoy en formato `YYYY-MM-DD`, en Argentina. No en la zona de quien mira: el
 * mismo chequeo corre en el servidor (UTC) y tiene que dar el mismo día.
 */
export function hoyISO(): string {
  return hoyArgentina();
}

/**
 * Devuelve el mensaje de error, o `null` si la fecha es plausible.
 *
 * `fechaNacimiento` vacío, `null` o `undefined` significa "sin dato": la
 * columna `pets.date_of_birth` es NULLABLE y `mappers.ts` la proyecta como
 * string vacío. Sin piso conocido no se valida el piso — es lo mismo que hace
 * el trigger de la 052.
 *
 * `hoy` es un parámetro para que las pruebas no dependan del día en que corren.
 */
export function validarFechaDePeso(
  fecha: string,
  fechaNacimiento?: string | null,
  hoy: string = hoyISO(),
): string | null {
  if (!fecha) return ERROR_FECHA_REQUERIDA;

  if (fecha > hoy) return ERROR_FECHA_FUTURA;

  if (fechaNacimiento && fecha < fechaNacimiento) {
    return errorFechaAnteriorAlNacimiento(fechaNacimiento);
  }

  return null;
}

/**
 * El pesaje ya cargado para ese mismo día, si hay. Prefiere uno del dueño (el
 * único que se puede reemplazar desde su cuenta) y, entre esos, el último de
 * la lista (las entradas vienen en orden cronológico).
 */
export function pesajeDelMismoDia<
  T extends { fecha: string; origen: "veterinario" | "dueno" },
>(pesajes: T[], fecha: string): T | undefined {
  const delDia = pesajes.filter((p) => p.fecha === fecha);
  return (
    delDia.findLast((p) => p.origen === "dueno") ?? delDia[delDia.length - 1]
  );
}
