/**
 * Qué imágenes acepta la aplicación, y por qué no alcanza con `image/*`.
 *
 * Hay dos cosas distintas que se confunden todo el tiempo: **subir** y **poder
 * mostrar**. `accept="image/*"` con una validación de `type.startsWith("image/")`
 * deja pasar cualquier cosa que el teléfono declare como imagen. Un HEIC/HEIF
 * supera esa prueba, viaja entero a Storage, deja `photo_url` escrito... y
 * después ningún navegador de escritorio ni Android lo dibuja. Queda una imagen
 * rota para siempre, y quien la subió vio el mensaje de éxito.
 *
 * Pero cerrar la lista a los tipos MIME y nada más rompe el caso opuesto, que
 * es MUY común en Android: varios selectores de archivo (el explorador del
 * sistema, Drive, lo que llega por mensajería) entregan el archivo con el tipo
 * **vacío** o como `application/octet-stream`. Es un JPG perfectamente válido
 * que el navegador nunca etiquetó. Rechazarlo por eso es negarle la foto a
 * alguien que hizo todo bien.
 *
 * Por eso la regla es: si el tipo se reconoce, manda el tipo; si no se
 * reconoce **porque no vino**, se decide por la extensión del nombre. Lo único
 * que se rechaza siempre es lo que sabemos que no se va a poder mostrar.
 *
 * El atributo `accept` lleva la misma lista por una razón concreta: al no
 * incluir HEIC, Safari en iOS convierte la foto a JPEG antes de entregarla.
 *
 * La validación del cliente es comodidad. La que decide es la del servidor
 * (`photo-actions.ts`): el tipo lo manda el navegador y se puede mentir.
 */

const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"] as const;

const EXTENSIONES_ACEPTADAS = ["jpg", "jpeg", "png", "webp"] as const;

/**
 * Formatos que el navegador no sabe decodificar. Se nombran uno por uno para
 * poder decir algo útil en vez de "formato inválido": quien sacó la foto con un
 * iPhone no tiene por qué saber qué es HEIC ni dónde se cambia.
 */
const EXTENSIONES_NO_MOSTRABLES = ["heic", "heif", "avif", "tif", "tiff"];

/** Tipos que significan "no sé qué es esto", no "esto está mal". */
const TIPOS_SIN_INFORMACION = [
  "",
  "application/octet-stream",
  "binary/octet-stream",
];

/** Para el atributo `accept` de un `<input type="file">`. */
export const ACCEPT_IMAGEN = [
  ...TIPOS_ACEPTADOS,
  ...EXTENSIONES_ACEPTADAS.map((ext) => `.${ext}`),
].join(",");

export type ArchivoAValidar = {
  name: string;
  type: string;
  size: number;
};

export type ResultadoValidacion = { ok: true } | { ok: false; error: string };

function extension(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto === -1 ? "" : nombre.slice(punto + 1).toLowerCase();
}

function enMegas(bytes: number): string {
  // `es-AR` para que sea "9,4 MB" y no "9.4 MB", como el resto de la interfaz.
  return `${(bytes / 1024 / 1024).toLocaleString("es-AR", {
    maximumFractionDigits: 1,
  })} MB`;
}

/**
 * Una sola validación para el cliente y para el servidor.
 *
 * Devuelve el mensaje ya escrito, y los mensajes **nombran el dato concreto**
 * —cuánto pesa, qué formato es— a propósito: este bug lo reportó alguien que no
 * programa, desde un teléfono que nosotros no tenemos. Un "no se pudo subir la
 * imagen" no se puede diagnosticar a distancia; "pesa 9,4 MB y el máximo son 5"
 * se resuelve sin que haga falta preguntar nada.
 */
export function validarImagenElegida(
  archivo: ArchivoAValidar,
): ResultadoValidacion {
  const ext = extension(archivo.name);
  const tipo = archivo.type.toLowerCase();

  if (
    EXTENSIONES_NO_MOSTRABLES.includes(ext) ||
    tipo.startsWith("image/hei") ||
    tipo === "image/avif" ||
    tipo === "image/tiff"
  ) {
    return {
      ok: false,
      error:
        "Ese formato de foto no se puede mostrar en la web. En la cámara del " +
        'teléfono elegí el formato "más compatible" (JPG), o convertila antes de subirla.',
    };
  }

  const tipoConocido = (TIPOS_ACEPTADOS as readonly string[]).includes(tipo);
  const sinTipo = TIPOS_SIN_INFORMACION.includes(tipo);
  const extConocida = (EXTENSIONES_ACEPTADAS as readonly string[]).includes(
    ext,
  );

  // Si el navegador no etiquetó el archivo, decide la extensión. Es el caso
  // habitual de los selectores de archivo de Android.
  const aceptado = tipoConocido || (sinTipo && extConocida);

  if (!aceptado) {
    return {
      ok: false,
      error: `No pudimos reconocer ese archivo${
        tipo && !sinTipo ? ` (${tipo})` : ""
      }. Elegí una imagen JPG, PNG o WEBP.`,
    };
  }

  if (archivo.size > MAX_BYTES_IMAGEN) {
    return {
      ok: false,
      error:
        `Esa foto pesa ${enMegas(archivo.size)} y el máximo son 5 MB. ` +
        "Sacala con menos resolución o achicala antes de subirla.",
    };
  }

  return { ok: true };
}
