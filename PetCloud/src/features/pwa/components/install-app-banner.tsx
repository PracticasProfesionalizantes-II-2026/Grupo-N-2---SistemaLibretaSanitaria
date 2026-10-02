"use client";

import { Download, Share, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { useSituacionInstalacion } from "@/features/pwa/hooks/use-install-situation";
import { pedirInstalacion } from "@/features/pwa/lib/install-prompt";

const DESCARTADO_KEY = "petcloud:instalar-descartado";

// Respaldo en memoria: si el almacenamiento está bloqueado, `localStorage`
// tira al leer o escribir, y el aviso igual tiene que quedar oculto durante
// la sesión después de cerrarlo.
let descartadoEnMemoria = false;
const listenersDescartado = new Set<() => void>();

function leerDescartado() {
  if (descartadoEnMemoria) return true;
  try {
    return localStorage.getItem(DESCARTADO_KEY) === "1";
  } catch {
    return false;
  }
}

function suscribirDescartado(listener: () => void) {
  listenersDescartado.add(listener);
  return () => {
    listenersDescartado.delete(listener);
  };
}

function marcarDescartado() {
  descartadoEnMemoria = true;
  try {
    localStorage.setItem(DESCARTADO_KEY, "1");
  } catch {
    // Queda el flag en memoria: vuelve a aparecer en la próxima visita.
  }
  for (const listener of listenersDescartado) listener();
}

/**
 * Aviso flotante para instalar PetCloud, solo donde tiene sentido insistir.
 *
 * Aparece en tres situaciones: cuando el navegador ofreció el instalador
 * nativo (`instalable`, con un botón que lo abre), en iOS/iPadOS y en Firefox
 * para Android (con la instrucción en una línea, porque ahí ninguna API le
 * permite a la página instalar). A Firefox de escritorio, a los navegadores
 * que instalan desde su menú y a quien tiene el almacenamiento bloqueado no
 * se los interrumpe: tienen la explicación completa en Configuración.
 *
 * En el servidor no se muestra nada (situación `null`, descartado `true`),
 * así que el HTML inicial nunca desajusta la hidratación. Al cerrarlo se
 * recuerda por dispositivo y se avisa dónde encontrar la instalación después.
 */
export function InstallAppBanner() {
  const situacion = useSituacionInstalacion();
  const descartado = useSyncExternalStore(
    suscribirDescartado,
    leerDescartado,
    () => true,
  );
  const [instalando, setInstalando] = useState(false);

  if (
    descartado ||
    (situacion !== "instalable" &&
      situacion !== "ios" &&
      situacion !== "firefox-android")
  ) {
    return null;
  }

  function descartar() {
    marcarDescartado();
    toast("Podés instalarla cuando quieras desde Configuración.");
  }

  async function instalar() {
    setInstalando(true);
    await pedirInstalacion();
    setInstalando(false);
  }

  const esInstalable = situacion === "instalable";

  return (
    <div className="border-border bg-card fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border p-4 shadow-lg sm:inset-x-auto sm:right-4">
      <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
        {esInstalable ? (
          <Download className="size-5" />
        ) : (
          <Share className="size-5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-semibold">
          Instalá {siteConfig.name}
        </p>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {situacion === "instalable"
            ? "Agregala a tu dispositivo para abrirla como una app, sin buscarla en el navegador."
            : situacion === "ios"
              ? 'Tocá "Compartir" y elegí "Agregar a inicio" para tenerla como una app.'
              : 'Tocá el menú ⋮ y elegí "Agregar a la pantalla de inicio" para tenerla como una app.'}
        </p>

        {esInstalable ? (
          <Button
            size="sm"
            className="mt-3"
            onClick={instalar}
            disabled={instalando}
          >
            {instalando ? "Instalando..." : "Instalar"}
          </Button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={descartar}
        aria-label="Cerrar"
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
