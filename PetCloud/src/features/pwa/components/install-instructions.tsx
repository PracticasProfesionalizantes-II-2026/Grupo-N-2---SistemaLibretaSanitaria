"use client";

import {
  Cookie,
  EllipsisVertical,
  Globe,
  type LucideIcon,
  Lock,
  MonitorDown,
  PlusSquare,
  RotateCw,
  Share,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { siteConfig } from "@/config/site";
import {
  type NavegadorManual,
  type SituacionInstalacion,
  detectarNavegadorManual,
  esFirefoxEscritorio,
  leerEntorno,
} from "@/features/pwa/lib/install-situation";

type Paso = { icono: LucideIcon; texto: string };

type Instrucciones = {
  intro?: string;
  pasos?: Paso[];
  notas?: string[];
};

const NOMBRE = siteConfig.name;

const NOTA_YA_INSTALADA = `Si ya la instalaste en este dispositivo, abrila desde tus aplicaciones.`;

const MANUAL: Record<NavegadorManual, Instrucciones> = {
  "chromium-escritorio": {
    intro: `Tu navegador permite instalar ${NOMBRE} desde su menú.`,
    pasos: [
      {
        icono: MonitorDown,
        texto:
          "Buscá el ícono de instalar al final de la barra de direcciones (una pantalla con una flecha) y hacé clic.",
      },
      {
        icono: EllipsisVertical,
        texto: `Si no lo ves, abrí el menú ⋮ y buscá "Instalar ${NOMBRE}" o "Guardar y compartir → Instalar página como app".`,
      },
      { icono: PlusSquare, texto: 'Confirmá con "Instalar".' },
    ],
    notas: [NOTA_YA_INSTALADA],
  },
  edge: {
    pasos: [
      {
        icono: EllipsisVertical,
        texto: "Abrí el menú … arriba a la derecha.",
      },
      {
        icono: MonitorDown,
        texto:
          'Entrá a "Aplicaciones" y elegí "Instalar este sitio como una aplicación".',
      },
      { icono: PlusSquare, texto: 'Confirmá con "Instalar".' },
    ],
    notas: [NOTA_YA_INSTALADA],
  },
  "chromium-android": {
    pasos: [
      { icono: EllipsisVertical, texto: "Tocá el menú ⋮ del navegador." },
      {
        icono: Smartphone,
        texto: 'Elegí "Instalar app" o "Agregar a la pantalla principal".',
      },
      { icono: PlusSquare, texto: 'Confirmá con "Instalar".' },
    ],
    notas: [NOTA_YA_INSTALADA],
  },
  "safari-mac": {
    pasos: [
      {
        icono: EllipsisVertical,
        texto: 'En la barra de menú, abrí "Archivo".',
      },
      { icono: MonitorDown, texto: 'Elegí "Agregar al Dock".' },
      { icono: PlusSquare, texto: 'Confirmá con "Agregar".' },
    ],
    notas: [
      `Necesitás macOS Sonoma o posterior. Si no aparece la opción, abrí ${NOMBRE} en Chrome o Edge.`,
      NOTA_YA_INSTALADA,
    ],
  },
};

function instruccionesPara(situacion: SituacionInstalacion): Instrucciones {
  switch (situacion) {
    case "ios":
      return {
        pasos: [
          {
            icono: Share,
            texto:
              "Tocá el botón Compartir (el cuadrado con una flecha hacia arriba). En el iPhone está abajo; en el iPad, arriba a la derecha.",
          },
          {
            icono: PlusSquare,
            texto: 'Deslizá hacia abajo y elegí "Agregar a inicio".',
          },
          {
            icono: Smartphone,
            texto: `Tocá "Agregar". ${NOMBRE} va a aparecer en tu pantalla de inicio como una app.`,
          },
        ],
        notas: [`Si no ves la opción, abrí ${NOMBRE} en Safari.`],
      };
    case "firefox-android":
      return {
        pasos: [
          { icono: EllipsisVertical, texto: "Tocá el menú ⋮ del navegador." },
          {
            icono: Smartphone,
            texto: 'Elegí "Agregar a la pantalla de inicio".',
          },
          { icono: PlusSquare, texto: 'Confirmá con "Agregar".' },
        ],
      };
    case "bloqueado":
      return {
        intro: `Para instalar ${NOMBRE}, permití que este sitio guarde datos en tu navegador (el candado de la barra de direcciones → Cookies y datos del sitio) y volvé a intentar.`,
        pasos: [
          {
            icono: Lock,
            texto: "Tocá el candado a la izquierda de la dirección.",
          },
          {
            icono: Cookie,
            texto:
              'Entrá a "Cookies y datos del sitio" y permití que el sitio guarde datos.',
          },
          {
            icono: RotateCw,
            texto: 'Recargá la página y volvé a tocar "Descargar aplicación".',
          },
        ],
      };
    case "manual":
      return MANUAL[detectarNavegadorManual(leerEntorno(window))];
    case "sin-soporte": {
      const navegador = esFirefoxEscritorio(leerEntorno(window))
        ? "Firefox"
        : "Este navegador";
      return {
        intro: `${navegador} no permite instalar ${NOMBRE} como aplicación. Abrila en Chrome o Edge para instalarla, o seguí usándola desde el navegador: funciona igual.`,
      };
    }
    default:
      return {};
  }
}

/**
 * Cómo instalar PetCloud en el navegador actual, paso a paso y sin jerga.
 *
 * Solo se monta del lado del cliente (se abre desde un botón), así que puede
 * leer `window` al renderizar.
 */
export function InstallInstructionsModal({
  open,
  onClose,
  situacion,
}: {
  open: boolean;
  onClose: () => void;
  situacion: SituacionInstalacion;
}) {
  if (!open) return null;

  const { intro, pasos, notas } = instruccionesPara(situacion);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Instalar ${NOMBRE}`}
      size="sm"
      footer={<Button onClick={onClose}>Entendido</Button>}
    >
      {situacion === "sin-soporte" ? (
        <div className="flex items-start gap-3">
          <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Globe className="size-5" />
          </span>
          <p className="text-foreground text-sm">{intro}</p>
        </div>
      ) : intro ? (
        <p className="text-foreground text-sm">{intro}</p>
      ) : null}

      {pasos && pasos.length > 0 ? (
        <ol className={intro ? "mt-4 space-y-3" : "space-y-3"}>
          {pasos.map((paso, indice) => (
            <li key={paso.texto} className="flex items-start gap-3">
              <span className="bg-brand-600 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
                {indice + 1}
              </span>
              <paso.icono className="text-brand-600 mt-0.5 size-[18px] shrink-0" />
              <span className="text-foreground text-sm">{paso.texto}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {notas && notas.length > 0 ? (
        <div className="mt-4 space-y-1">
          {notas.map((nota) => (
            <p key={nota} className="text-muted-foreground text-xs">
              {nota}
            </p>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
