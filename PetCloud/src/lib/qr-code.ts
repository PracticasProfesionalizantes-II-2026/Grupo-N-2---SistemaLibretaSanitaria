/**
 * Códigos de collar.
 *
 * Formato `PC-XXXX-XXXX`. Es lo que va impreso en una chapita colgada de un
 * animal, así que las decisiones son de legibilidad humana antes que de
 * entropía: alguien va a tener que tipearlo mirando una chapa rayada, de noche,
 * con el perro moviéndose.
 */

/**
 * Alfabeto sin `I`, `O`, `0`, `1`, `L` ni `S`/`5`: son los pares que se
 * confunden al leer un código impreso o al dictarlo por teléfono. Quedan 30
 * símbolos y 8 posiciones, o sea 30⁸ ≈ 6,5 × 10¹¹ combinaciones — de sobra para
 * que una colisión sea rarísima, y aun así se verifica contra la base.
 */
const ALFABETO = "ABCDEFGHJKMNPQRTUVWXYZ2346789";

const BLOQUE = 4;

function bloqueAleatorio() {
  const bytes = crypto.getRandomValues(new Uint8Array(BLOQUE));

  return Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join("");
}

/** Un código nuevo, sin verificar contra la base. */
export function generateQrCode() {
  return `PC-${bloqueAleatorio()}-${bloqueAleatorio()}`;
}

const QR_CODE_RE = /^PC-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export const isQrCode = (value: string) => QR_CODE_RE.test(value.toUpperCase());

/**
 * Encuentra un código de collar dentro de lo que sea que haya leído la
 * cámara.
 *
 * El QR no codifica el código pelado: codifica la URL pública completa
 * (`.../p/PC-XXXX-XXXX`), así que lo primero que decodifica un lector es esa
 * URL entera. Esto también acepta el código solo, para el campo de ingreso
 * manual y para credenciales viejas que lo hayan impreso así.
 */
export function extractQrCode(raw: string): string | null {
  const texto = raw.trim().toUpperCase();
  if (isQrCode(texto)) return texto;

  const encontrado = texto.match(/PC-[A-Z2-9]{4}-[A-Z2-9]{4}/);
  return encontrado ? encontrado[0] : null;
}

/**
 * Un código único, comprobado contra los que ya existen.
 *
 * La comprobación va contra `pet_qr_codes` y no contra `pets`: ahí están también
 * los dados de baja, y un código revocado no puede reaparecer en otra mascota.
 * Si lo hiciera, un collar viejo que alguien encuentre llevaría a un animal que
 * no es — el peor final posible para esta función.
 *
 * `isTaken` se inyecta para que esto no dependa de la base y se pueda probar.
 */
export async function generateUniqueQrCode(
  isTaken: (code: string) => Promise<boolean>,
  intentos = 8,
) {
  for (let i = 0; i < intentos; i += 1) {
    const code = generateQrCode();
    if (!(await isTaken(code))) return code;
  }

  // Con este espacio de códigos, fallar ocho veces seguidas no es mala suerte:
  // es que algo anda mal con la consulta. Mejor romper que asignar un duplicado.
  throw new Error(
    "No se pudo generar un código de collar único después de varios intentos.",
  );
}

/**
 * Códigos de sesión de sala de espera.
 *
 * Formato `PCW-XXXX-XXXX-XXXX`: un bloque más que el collar
 * (`PC-XXXX-XXXX`), mismo alfabeto, con `W` en el prefijo. Ese prefijo evita
 * la colisión: `PCW-` no contiene `PC-` seguido de exactamente cuatro
 * caracteres del alfabeto (el carácter que sigue a `PC` es `W`, nunca `-`),
 * así que `QR_CODE_RE` jamás matchea adentro de un código de sala de espera.
 *
 * Rota por sesión (`waiting_room_qr_sessions`): no
 * es un secreto permanente pegado a una mascota, es un código que la
 * institución emite y revoca.
 */
export const WAITING_ROOM_QR_RE = /^PCW-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

const esCodigoDeSalaDeEspera = (value: string) =>
  WAITING_ROOM_QR_RE.test(value.toUpperCase());

/** Un código de sala de espera nuevo, sin verificar contra la base. */
export function generateWaitingRoomQrCode() {
  return `PCW-${bloqueAleatorio()}-${bloqueAleatorio()}-${bloqueAleatorio()}`;
}

/**
 * Encuentra un código de sala de espera dentro de lo que sea que haya leído
 * la cámara. Mismo criterio que `extractQrCode`: el
 * QR codifica la URL pública completa (`.../visitas/ingreso/PCW-XXXX-XXXX-XXXX`),
 * no el código pelado.
 */
export function extractWaitingRoomQrCode(raw: string): string | null {
  const texto = raw.trim().toUpperCase();
  if (esCodigoDeSalaDeEspera(texto)) return texto;

  const encontrado = texto.match(/PCW-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/);
  return encontrado ? encontrado[0] : null;
}

/** Lo que devuelve `classifyScannedCode`: cuál de los dos formatos es, y ya pelado. */
export type ScannedCode =
  { tipo: "collar"; codigo: string } | { tipo: "sala"; codigo: string };

/**
 * Punto único de entrada para clasificar un texto escaneado: collar o sesión
 * de sala de espera.
 *
 * Los lectores del proyecto enrutan desde acá en vez de repetir cada uno su
 * propia lógica de "¿esto es un PC- o un PCW-?". Se prueba primero sala de
 * espera y collar queda último porque su regex es la más laxa (dos bloques
 * contra tres).
 */
export function classifyScannedCode(raw: string): ScannedCode | null {
  const sala = extractWaitingRoomQrCode(raw);
  if (sala) return { tipo: "sala", codigo: sala };

  const collar = extractQrCode(raw);
  if (collar) return { tipo: "collar", codigo: collar };

  return null;
}
