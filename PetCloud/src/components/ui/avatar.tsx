"use client";

import Image from "next/image";
import { useState } from "react";

import { ImageLightbox } from "@/components/ui/image-lightbox";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-20 text-xl",
};

/** Lado en píxeles de cada variante — tiene que ser el mismo número que `size-*` de arriba. */
const PIXELS: Record<keyof typeof SIZES, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

/**
 * Avatar con foto real cuando `src` viene cargado; si no hay foto, o si la URL
 * falla al cargar, cae a las iniciales del nombre.
 *
 * Con `expandable`, tocar la foto la abre a pantalla completa. Solo la foto:
 * unas iniciales no tienen nada que ampliar, así que en ese caso el avatar
 * sigue siendo un adorno y no un botón que promete algo que no va a pasar.
 */
export function Avatar({
  name,
  src,
  size = "md",
  className,
  expandable = false,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  /**
   * Permite ampliar la foto al tocarla. Se activa donde la foto es el retrato
   * de alguien —el perfil de una mascota, el del dueño— y no donde el avatar
   * es apenas una miniatura al lado de un nombre o el disparador de un menú.
   */
  expandable?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  if (src && !errored) {
    const pixeles = PIXELS[size];
    const foto = (
      <Image
        src={src}
        alt={name}
        width={pixeles}
        height={pixeles}
        sizes={`${pixeles}px`}
        onError={() => setErrored(true)}
        className={cn(
          "shrink-0 rounded-full object-cover",
          SIZES[size],
          // Sin envoltorio, la foto es lo que se ubica en el layout y le
          // corresponde el `className` de quien la usó. Con envoltorio, ese
          // lugar pasa a ser el botón (ver abajo).
          !expandable && className,
        )}
      />
    );

    if (!expandable) return foto;

    return (
      <>
        {/*
          Un `<button>` y no un `onClick` sobre la imagen: así se llega con Tab,
          se activa con Enter, y el lector de pantalla anuncia que hay algo que
          hacer. El `rounded-full` va también acá para que el anillo de foco
          siga la forma de la foto en vez de dibujar un cuadrado alrededor.

          El `className` de quien usa el avatar viaja hasta acá porque este es
          ahora el elemento que ocupa su lugar: un `mx-auto` puesto en la imagen
          no centraría nada, ya que la imagen pasó a llenar el botón.
        */}
        <button
          type="button"
          onClick={() => setAmpliada(true)}
          aria-label={`Ampliar la foto de ${name}`}
          className={cn(
            "focus-visible:ring-brand-600 block shrink-0 cursor-zoom-in rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            className,
          )}
        >
          {foto}
        </button>

        <ImageLightbox
          open={ampliada}
          onClose={() => setAmpliada(false)}
          src={src}
          alt={`Foto de ${name}`}
        />
      </>
    );
  }

  return (
    <span
      className={cn(
        "bg-brand-100 text-brand-700 flex shrink-0 items-center justify-center rounded-full font-semibold",
        SIZES[size],
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
