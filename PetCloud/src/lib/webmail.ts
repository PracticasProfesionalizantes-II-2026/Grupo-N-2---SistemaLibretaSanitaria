/**
 * De una dirección de correo al webmail donde leerla.
 *
 * Sirve para el botón "Abrir mi correo" de las pantallas que dejan a la persona
 * esperando un mensaje: en vez de salir de la app a buscarlo a mano, se abre la
 * bandeja del proveedor que corresponde.
 *
 * **Es una función pura y local: no consulta nada.** Eso importa porque
 * la app nunca revela si un email tiene cuenta. Ramificar por el
 * DOMINIO no es lo mismo que ramificar por la EXISTENCIA de la cuenta: el
 * dominio lo escribió la propia persona en el formulario y no dice nada que
 * quien mira no supiera ya. Lo que sí sería un oráculo es que el botón aparezca
 * o cambie según si el email está registrado — por eso acá no hay ninguna
 * consulta, y por eso la pantalla de recuperar contraseña (donde el email
 * puede no existir) puede mostrarlo sin problema.
 *
 * **Por qué URL web y no un deep link de app** (`googlegmail://`, `message://`):
 * no hay forma de saber si la app está instalada, así que cuando no lo está el
 * enlace muere en silencio y queda un botón que no hace nada. Las URLs de abajo
 * están registradas como app links en Android e iOS, así que el sistema abre la
 * app cuando existe y el navegador cuando no. El fallback lo resuelve el
 * sistema operativo, que es el único que tiene el dato.
 *
 * `mailto:` tampoco sirve: abre a redactar un correo nuevo, no la bandeja.
 */

export type Webmail = {
  /** Cómo llamarlo en el botón. */
  nombre: string;
  url: string;
};

/**
 * Solo proveedores con webmail público y estable, incluidas las variantes
 * argentinas (`.com.ar`) que son las que más se ven acá.
 *
 * Deliberadamente **no** están los dominios propios de Google Workspace
 * (`@unaempresa.com`): son Gmail por detrás, pero desde afuera no hay forma de
 * saberlo sin consultarle a alguien, y adivinar mal manda a la persona a una
 * pantalla de login ajena. Un dominio que no esté acá no muestra botón.
 */
const WEBMAILS: Record<string, Webmail> = {
  "gmail.com": { nombre: "Gmail", url: "https://mail.google.com/" },
  "googlemail.com": { nombre: "Gmail", url: "https://mail.google.com/" },

  "outlook.com": { nombre: "Outlook", url: "https://outlook.live.com/mail/0/" },
  "outlook.com.ar": {
    nombre: "Outlook",
    url: "https://outlook.live.com/mail/0/",
  },
  "outlook.es": { nombre: "Outlook", url: "https://outlook.live.com/mail/0/" },
  "hotmail.com": { nombre: "Outlook", url: "https://outlook.live.com/mail/0/" },
  "hotmail.com.ar": {
    nombre: "Outlook",
    url: "https://outlook.live.com/mail/0/",
  },
  "hotmail.es": { nombre: "Outlook", url: "https://outlook.live.com/mail/0/" },
  "live.com": { nombre: "Outlook", url: "https://outlook.live.com/mail/0/" },
  "live.com.ar": { nombre: "Outlook", url: "https://outlook.live.com/mail/0/" },
  "msn.com": { nombre: "Outlook", url: "https://outlook.live.com/mail/0/" },

  "yahoo.com": { nombre: "Yahoo", url: "https://mail.yahoo.com/" },
  "yahoo.com.ar": { nombre: "Yahoo", url: "https://mail.yahoo.com/" },
  "ymail.com": { nombre: "Yahoo", url: "https://mail.yahoo.com/" },

  "icloud.com": { nombre: "iCloud", url: "https://www.icloud.com/mail" },
  "me.com": { nombre: "iCloud", url: "https://www.icloud.com/mail" },
  "mac.com": { nombre: "iCloud", url: "https://www.icloud.com/mail" },

  "proton.me": { nombre: "Proton Mail", url: "https://mail.proton.me/" },
  "protonmail.com": { nombre: "Proton Mail", url: "https://mail.proton.me/" },
  "pm.me": { nombre: "Proton Mail", url: "https://mail.proton.me/" },

  "zoho.com": { nombre: "Zoho Mail", url: "https://mail.zoho.com/" },
  "aol.com": { nombre: "AOL Mail", url: "https://mail.aol.com/" },
};

/**
 * El webmail de esa dirección, o `null` si no se reconoce el dominio.
 *
 * `null` es la respuesta correcta y frecuente —cualquier dominio corporativo cae
 * ahí— y quien llama tiene que **ocultar el botón**, no mostrar uno genérico:
 * un botón que lleva a una bandeja que no es la tuya es peor que ninguno
 *.
 */
export function webmailDeEmail(
  email: string | null | undefined,
): Webmail | null {
  if (!email) return null;

  const arroba = email.lastIndexOf("@");
  if (arroba === -1) return null;

  const dominio = email
    .slice(arroba + 1)
    .trim()
    .toLowerCase();

  return WEBMAILS[dominio] ?? null;
}
