/**
 * El estado antirrábico tal como lo ve un desconocido que escanea una chapita.
 *
 * Este módulo es dueño del tipo, de las etiquetas y del parseo. **No importa
 * nada del panel privado**, y eso no es prolijidad: es la frontera.
 *
 * El panel del dueño tiene su propio estado sanitario (`HealthStatus`), que hoy
 * tiene los mismos cuatro valores. Aliasar uno al otro sería cómodo y sería un
 * error: el día que alguien agregue un quinto estado para una pantalla privada
 * —"en revisión", "rechazada", lo que sea— ese valor llegaría gratis a la única
 * superficie del sistema que lee cualquiera sin cuenta. Dos tipos que hoy se
 * parecen, pero que responden a dos preguntas distintas y cambian por motivos
 * distintos.
 *
 * Vive en `lib/` y no junto a `PublicPet` porque `public-pet.ts` abre con
 * `import "server-only"`: las etiquetas y el parser son valores en tiempo de
 * ejecución que necesita un componente de cliente.
 */

/** Lo que devuelve `public_rabies_status()` (migración 050), y nada más. */
export type EstadoAntirrabica =
  "al-dia" | "por-vencer" | "vencida" | "sin-datos";

export const ETIQUETAS_ANTIRRABICA: Record<
  EstadoAntirrabica,
  { label: string; variant: "success" | "warning" | "danger" | "neutral" }
> = {
  "al-dia": { label: "Antirrábica al día", variant: "success" },
  "por-vencer": { label: "Antirrábica por vencer", variant: "warning" },
  vencida: { label: "Antirrábica vencida", variant: "danger" },
  /**
   * "Sin antirrábica certificada", no "Sin datos".
   *
   * "Sin datos" se lee como "este perro no está vacunado", y eso el sistema no
   * lo sabe: hay gente con la mascota vacunada cuya dosis todavía no firmó
   * nadie. Lo único cierto es más angosto — no hay constancia de un
   * veterinario— y el texto dice exactamente eso.
   *
   * Gris y no rojo por el mismo motivo: "no sabemos" no es "está mal".
   */
  "sin-datos": { label: "Sin antirrábica certificada", variant: "neutral" },
};

/**
 * Va siempre visible al lado del badge. Sin esta línea, los cuatro estados se
 * leen como un parte veterinario y no como lo que son: lo que quedó
 * registrado.
 */
export const AYUDA_ANTIRRABICA =
  "Refleja solo las dosis registradas por un veterinario.";

/**
 * Texto de la base a estado, fallando cerrado.
 *
 * Cualquier cosa que no sea uno de los cuatro valores —NULL porque la consulta
 * falló, una cadena vacía, un quinto estado que la función gane mañana— cae en
 * `"sin-datos"`. Es la dirección del error que el proposal acepta por escrito:
 * mandar a alguien a una consulta que no hacía falta se arregla; un "al día"
 * inventado que lo convence de no tratarse, no.
 *
 * `Object.hasOwn` y no `in`: `"toString" in ETIQUETAS_ANTIRRABICA` es `true`
 * por la cadena de prototipos, y el badge terminaría intentando renderizar una
 * función.
 */
export function parseEstadoAntirrabica(
  valor: string | null | undefined,
): EstadoAntirrabica {
  if (!valor) return "sin-datos";

  return Object.hasOwn(ETIQUETAS_ANTIRRABICA, valor)
    ? (valor as EstadoAntirrabica)
    : "sin-datos";
}
