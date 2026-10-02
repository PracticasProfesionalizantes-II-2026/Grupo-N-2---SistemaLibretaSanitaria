"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Portal } from "@/components/ui/portal";

/**
 * Una foto a pantalla completa, para verla en serio.
 *
 * No usa `<Modal>` a propósito: aquel trae encabezado, título y borde de
 * tarjeta, y una foto metida en una tarjeta con encabezado se ve más chica que
 * antes de ampliarla. Acá lo único que importa es la imagen; todo lo demás se
 * corre del camino.
 *
 * Por regla de navegación del proyecto no cambia la URL: se abre sobre la
 * pantalla actual y al cerrarla se vuelve exactamente a donde se estaba.
 *
 * Se cierra de tres formas, porque en cada dispositivo la natural es otra:
 * la cruz, tocar fuera de la foto, y Escape.
 */
export function ImageLightbox({
  open,
  onClose,
  src,
  alt,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  /** Qué se ve en la foto. Es también el nombre accesible del diálogo. */
  alt: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);

    // Sin esto la página de atrás sigue desplazándose bajo la foto: se ve el
    // contenido moviéndose por los bordes y al cerrar quedaste en otro lado.
    const scrollAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // La cruz es el único control acá adentro. Enfocarla deja el teclado
    // encerrado en el diálogo y hace que Escape funcione sin tocar nada antes.
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = scrollAnterior;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-8"
      >
        <div
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar la foto"
          className="absolute top-4 right-4 z-10 flex size-11 items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur transition-colors hover:bg-slate-950/80 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <X className="size-6" />
        </button>

        {/*
          `object-contain` con tope de alto y ancho: la foto crece todo lo que
          la pantalla permita y ni un pixel más, así nunca aparece una barra de
          desplazamiento ni se recorta un pedazo del animal.

          `svh` y no `vh` porque en el navegador del teléfono `vh` cuenta la
          altura con la barra de direcciones oculta, y la foto termina más alta
          que lo que se ve.
        */}
        <img
          src={src}
          alt={alt}
          className="relative max-h-[85svh] max-w-full rounded-xl object-contain shadow-2xl"
        />
      </div>
    </Portal>
  );
}
