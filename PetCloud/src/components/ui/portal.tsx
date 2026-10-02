"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { useIsMounted } from "@/lib/use-is-mounted";

/**
 * Renderiza sus hijos al final de `document.body`.
 *
 * Hace falta para overlays (modales, drawers) porque un ancestro con
 * `backdrop-filter`, `transform` o `filter` se convierte en el bloque
 * contenedor de sus descendientes `position: fixed`. En ese caso `inset-0` deja
 * de medirse contra la ventana y pasa a medirse contra ese ancestro: el overlay
 * queda recortado a su tamaño. El topbar de la app usa `backdrop-blur`, así que
 * cualquier overlay que nazca adentro necesita salir por acá.
 */
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useIsMounted();

  if (!mounted) return null;

  return createPortal(children, document.body);
}
