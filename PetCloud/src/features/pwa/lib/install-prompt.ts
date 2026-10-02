import {
  type BeforeInstallPromptEvent,
  EVENTO_INSTALACION,
  type EstadoInstalacionGlobal,
} from "@/features/pwa/lib/early-capture-script";
import {
  type SituacionInstalacion,
  detectarSituacion,
  leerEntorno,
} from "@/features/pwa/lib/install-situation";

/**
 * Store de módulo para la instalación de PetCloud.
 *
 * La única fuente de verdad del evento es `window.__petcloudInstall`, que
 * llena el script inline del layout. Si ese script no corrió (una navegación
 * que no pasó por el layout raíz, un bloqueador), se hace la misma captura
 * acá, con la misma forma y el mismo evento propio: el resto del código no
 * distingue un caso del otro.
 *
 * Todo acceso a `window` está protegido: en el servidor el módulo se importa
 * igual, pero no hace nada.
 */

const listeners = new Set<() => void>();
let capturaLista = false;
let errorServiceWorker = false;

function notificar() {
  for (const listener of listeners) listener();
}

function estadoGlobal(): EstadoInstalacionGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__petcloudInstall;
}

function asegurarCaptura() {
  if (capturaLista || typeof window === "undefined") return;
  capturaLista = true;

  if (!window.__petcloudInstall) {
    const estado: EstadoInstalacionGlobal = { evento: null, instalada: false };
    window.__petcloudInstall = estado;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      estado.evento = event as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event(EVENTO_INSTALACION));
    });
    window.addEventListener("appinstalled", () => {
      estado.evento = null;
      estado.instalada = true;
      window.dispatchEvent(new Event(EVENTO_INSTALACION));
    });
  }

  window.addEventListener(EVENTO_INSTALACION, notificar);

  try {
    const consulta = window.matchMedia?.("(display-mode: standalone)");
    if (consulta && typeof consulta.addEventListener === "function") {
      consulta.addEventListener("change", notificar);
    }
  } catch {
    // Sin `matchMedia` no hay cambio de modo que escuchar.
  }
}

export function reportarErrorServiceWorker(error: unknown) {
  errorServiceWorker = true;
  console.warn(
    "[PetCloud] No se pudo registrar el service worker; la app no va a poder instalarse desde este navegador.",
    error,
  );
  notificar();
}

/**
 * Snapshot del cliente. Devuelve un string, así que es estable entre llamadas
 * mientras nada cambie — lo que `useSyncExternalStore` necesita.
 */
export function obtenerSituacion(): SituacionInstalacion {
  asegurarCaptura();
  const estado = estadoGlobal();
  return detectarSituacion(leerEntorno(window), {
    hayEventoGuardado: Boolean(estado?.evento),
    appInstalada: estado?.instalada === true,
    errorServiceWorker,
  });
}

/** En el servidor no se sabe nada: no se renderiza nada. */
export const obtenerSituacionServidor = (): SituacionInstalacion | null => null;

export function suscribir(listener: () => void) {
  asegurarCaptura();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Abre el instalador nativo con el evento guardado.
 *
 * Un `beforeinstallprompt` se puede usar una sola vez: se descarta tanto si
 * el usuario acepta como si cancela.
 */
export async function pedirInstalacion(): Promise<
  "accepted" | "dismissed" | "no-disponible"
> {
  const estado = estadoGlobal();
  const evento = estado?.evento;
  if (!estado || !evento) return "no-disponible";

  try {
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    return outcome;
  } catch {
    return "no-disponible";
  } finally {
    estado.evento = null;
    notificar();
  }
}
