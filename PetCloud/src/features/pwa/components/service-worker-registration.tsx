"use client";

import { useEffect } from "react";

import { reportarErrorServiceWorker } from "@/features/pwa/lib/install-prompt";

/**
 * Registra `/sw.js` — solo en producción.
 *
 * En desarrollo, Turbopack ya recarga módulos por su cuenta; un service
 * worker de por medio cachearía un shell viejo y confundiría cada cambio con
 * un problema de caché en vez de dejar ver el código nuevo. No hay nada que
 * un SW le sume al `npm run dev` local.
 *
 * Si el registro falla, PetCloud sigue funcionando como sitio web, pero el
 * fallo ya no es silencioso: sin service worker algunos navegadores no
 * ofrecen instalar la app, y la interfaz tiene que poder explicarlo. Por eso
 * el error se reporta al store de instalación.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    try {
      // Con el almacenamiento del sitio bloqueado, algunos navegadores tiran
      // un SecurityError con solo leer `navigator.serviceWorker`.
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker
        .register("/sw.js")
        .catch(reportarErrorServiceWorker);
    } catch (error) {
      reportarErrorServiceWorker(error);
    }
  }, []);

  return null;
}
