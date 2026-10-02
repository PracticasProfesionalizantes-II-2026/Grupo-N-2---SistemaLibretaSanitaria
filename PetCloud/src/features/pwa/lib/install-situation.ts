/**
 * Qué puede hacer este dispositivo para instalar PetCloud.
 *
 * Módulo puro: no toca `window` ni `navigator` salvo en `leerEntorno`, que los
 * recibe por parámetro. Así la decisión entera se prueba con user agents
 * reales en Vitest, sin navegador.
 */

export type SituacionInstalacion =
  /** Ya corre como app instalada, o el navegador avisó que se instaló. */
  | "instalada"
  /** Hay un `beforeinstallprompt` guardado: un botón real puede instalarla. */
  | "instalable"
  /** iOS/iPadOS: solo "Compartir → Agregar a inicio", en cualquier navegador. */
  | "ios"
  /** Firefox en Android: se instala desde su menú. */
  | "firefox-android"
  /** El navegador instala desde su propio menú (Chrome, Edge, Safari en Mac). */
  | "manual"
  /** Chromium sin service worker: el sitio no puede guardar datos. */
  | "bloqueado"
  /** El navegador no instala aplicaciones web. */
  | "sin-soporte";

export type NavegadorManual =
  "safari-mac" | "edge" | "chromium-android" | "chromium-escritorio";

export type Entorno = {
  userAgent: string;
  maxTouchPoints: number;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
};

export type EstadoInstalacion = {
  hayEventoGuardado: boolean;
  appInstalada: boolean;
  errorServiceWorker: boolean;
};

type VentanaMinima = {
  navigator: {
    userAgent: string;
    maxTouchPoints?: number;
    standalone?: boolean;
  };
  matchMedia?: (query: string) => { matches: boolean };
};

/**
 * Lee del navegador solo lo que `detectarSituacion` necesita.
 *
 * Chrome/Android/escritorio exponen `display-mode`; Safari en iOS expone
 * `navigator.standalone`. Ninguno existe en todos los navegadores, así que se
 * leen los dos y ninguno rompe si falta.
 */
export function leerEntorno(win: VentanaMinima): Entorno {
  let displayModeStandalone = false;
  try {
    displayModeStandalone =
      typeof win.matchMedia === "function" &&
      win.matchMedia("(display-mode: standalone)").matches === true;
  } catch {
    displayModeStandalone = false;
  }

  return {
    userAgent: win.navigator.userAgent ?? "",
    maxTouchPoints: win.navigator.maxTouchPoints ?? 0,
    displayModeStandalone,
    navigatorStandalone: win.navigator.standalone === true,
  };
}

/**
 * iPhone, iPod o iPad. Desde iPadOS 13 el iPad se presenta como una Mac de
 * escritorio; lo que lo delata es la pantalla táctil.
 */
export function esIOS(
  entorno: Pick<Entorno, "userAgent" | "maxTouchPoints">,
): boolean {
  const ua = entorno.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && entorno.maxTouchPoints > 1)
  );
}

function esFirefox(ua: string) {
  return /Firefox\//.test(ua);
}

function esChromium(ua: string) {
  // Incluye Edge, Samsung Internet y Opera: todos declaran `Chrome/`.
  return /Chrome\/|Chromium\/|Edg\//.test(ua);
}

function esSafariMac(ua: string) {
  return (
    /Macintosh/.test(ua) &&
    /Safari\//.test(ua) &&
    !/Chrome|Chromium|Edg/.test(ua)
  );
}

/** Firefox de escritorio: el único caso de `sin-soporte` con mensaje propio. */
export function esFirefoxEscritorio(entorno: Pick<Entorno, "userAgent">) {
  return esFirefox(entorno.userAgent) && !/Android/.test(entorno.userAgent);
}

export function detectarSituacion(
  entorno: Entorno,
  estado: EstadoInstalacion,
): SituacionInstalacion {
  const ua = entorno.userAgent;

  if (
    entorno.displayModeStandalone ||
    entorno.navigatorStandalone ||
    estado.appInstalada
  ) {
    return "instalada";
  }

  if (estado.hayEventoGuardado) return "instalable";

  // Todos los navegadores de iOS usan el motor de Safari: ninguno dispara
  // `beforeinstallprompt`, en todos se instala desde "Compartir".
  if (esIOS(entorno)) return "ios";

  if (esFirefox(ua)) {
    return /Android/.test(ua) ? "firefox-android" : "sin-soporte";
  }

  if (esChromium(ua)) {
    // Sin evento guardado Chrome igual puede instalar desde su menú (el
    // evento ya se usó, o todavía no disparó). Decirle a un usuario de
    // Chrome que su navegador no puede instalar sería falso.
    return estado.errorServiceWorker ? "bloqueado" : "manual";
  }

  // Safari 17+ en macOS: Archivo → Agregar al Dock.
  if (esSafariMac(ua)) return "manual";

  return "sin-soporte";
}

export function detectarNavegadorManual(
  entorno: Pick<Entorno, "userAgent">,
): NavegadorManual {
  const ua = entorno.userAgent;
  if (esSafariMac(ua)) return "safari-mac";
  if (/Edg\//.test(ua)) return "edge";
  if (/Android/.test(ua)) return "chromium-android";
  return "chromium-escritorio";
}
