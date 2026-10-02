"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isThemedRoute } from "@/config/app-routes";

/**
 * Tema de la aplicación.
 *
 * La preferencia se guarda una sola vez y vale para todo el sistema, pero
 * **solo se aplica adentro** (ver `isThemedRoute`). En el sitio público y en
 * las pantallas de acceso se fuerza el claro con `forcedTheme`, que pinta sin
 * tocar lo guardado: quien tenía el oscuro activado lo recupera intacto al
 * volver a entrar.
 *
 * `forcedTheme` viaja también en el script que `next-themes` inyecta antes de
 * pintar, así que en una carga directa del home no hay parpadeo oscuro. Y como
 * es reactivo al cambio de ruta, cerrar sesión desde un panel en oscuro deja el
 * home en claro sin recargar — que era el defecto original.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      forcedTheme={isThemedRoute(pathname) ? undefined : "light"}
    >
      {children}
    </NextThemesProvider>
  );
}
