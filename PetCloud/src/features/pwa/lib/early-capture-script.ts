/**
 * Captura temprana de `beforeinstallprompt`.
 *
 * Existe porque un listener registrado en un `useEffect` recién se engancha
 * después de hidratar. Si Chrome dispara `beforeinstallprompt` antes —y en una
 * página liviana o con la caché caliente pasa—, el evento se pierde para
 * siempre: dispara una sola vez por carga de página. Este script corre inline
 * en el HTML inicial, mientras se parsea y antes de hidratar, y deja el evento
 * guardado en `window.__petcloudInstall` para que el store lo lea después.
 *
 * Es ES5 a propósito: se inyecta tal cual, sin pasar por el compilador.
 */

/** Clave global donde vive el estado compartido entre el script y el store. */
const CLAVE_GLOBAL_INSTALACION = "__petcloudInstall";

/** Evento propio que avisa que cambió el estado de instalación. */
export const EVENTO_INSTALACION = "petcloud:instalacion";

/** `beforeinstallprompt` no está tipado en el DOM estándar de TypeScript. */
export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type EstadoInstalacionGlobal = {
  evento: BeforeInstallPromptEvent | null;
  instalada: boolean;
};

declare global {
  interface Window {
    __petcloudInstall?: EstadoInstalacionGlobal;
  }
}

export const SCRIPT_CAPTURA_TEMPRANA = `(function(){
if (window.${CLAVE_GLOBAL_INSTALACION}) return;
var estado = { evento: null, instalada: false };
window.${CLAVE_GLOBAL_INSTALACION} = estado;
function avisar(){ window.dispatchEvent(new Event("${EVENTO_INSTALACION}")); }
window.addEventListener("beforeinstallprompt", function(e){
e.preventDefault();
estado.evento = e;
avisar();
});
window.addEventListener("appinstalled", function(){
estado.evento = null;
estado.instalada = true;
avisar();
});
})();`;
