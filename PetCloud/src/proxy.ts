import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import {
  isAllowedForRole,
  isAppRoute,
  isAuthRoute,
  isPublicRoute,
} from "@/config/app-routes";
import { getPostLoginRoute, toAppRole } from "@/config/roles";

const { auth } = NextAuth(authConfig);

/**
 * Protección de rutas.
 *
 * En Next 16 esto se llama `proxy`, no `middleware` (ver la guía de migración a
 * la v16 en `node_modules/next/dist/docs`). Corre en el runtime de Node.
 *
 Lee la sesión de Auth.js (cookie JWT firmada con AUTH_SECRET, ver
 * `src/auth.config.ts`) y **filtra por rol**: un dueño no entra a
 * `/veterinaria`, un veterinario no entra a `/admin`.
 *
 * Es un filtro **optimista**, no la última línea de defensa: la documentación de
 * Next avisa que el proxy corre también en los prefetch y desaconseja hacer
 * consultas a la base acá. Por eso el rol se lee del JWT de la sesión, que viaja
 * firmado y el usuario no puede escribir — un `SELECT` a
 * `profiles` en cada navegación sería un viaje de ida y vuelta por cada enlace
 * que el navegador precarga. Lo que de verdad decide son los guards del
 * servidor (`requireUser()` y compañía).
 */
export const proxy = auth((request) => {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();

  // Endpoints propios de Auth.js y archivos (que chequean permisos adentro).
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/storage")) {
    return response;
  }

  const user = request.auth?.user ?? null;
  const role = toAppRole(user?.role);

  // 1. Sitio público: siempre abierto, con o sin sesión.
  if (isPublicRoute(pathname)) return response;

  // 2. Pantallas de acceso: quien ya entró no tiene nada que hacer acá.
  if (isAuthRoute(pathname)) {
    if (user) {
      return NextResponse.redirect(
        new URL(getPostLoginRoute(role), request.url),
      );
    }
    return response;
  }

  // 3. Todo lo demás exige sesión. `next` conserva a dónde quería ir, para
  //    devolverlo ahí después de entrar en vez de dejarlo en el inicio.
  if (!user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  // 4. Y el panel que le corresponde.
  if (!isAllowedForRole(pathname, role)) {
    // Antes de hablar de permisos hay que ver si la URL existe. Una dirección
    // que no pertenece a ningún panel está mal escrita, no prohibida: mandarla
    // al panel de la persona esconde el error y deja pensando que la pantalla
    // se movió. Se deja pasar y Next muestra su 404, que es lo que pasó.
    if (!isAppRoute(pathname)) return response;

    return NextResponse.redirect(new URL(getPostLoginRoute(role), request.url));
  }

  return response;
});

export const config = {
  matcher: [
    /*
     * Todo menos los archivos que no son pantallas: estáticos de Next, imágenes
     * optimizadas, favicon y assets. Correr el proxy sobre esos sería agregarle
     * una validación de sesión a cada logo.
     *
     * `robots.txt`, `sitemap.xml`, `manifest.webmanifest` y `sw.js` se agregan
     * a propósito, nombre por nombre: son archivos públicos con ruta fija en
     * `public/`, y sin esta excepción el proxy los trataba como cualquier
     * pantalla de la app y los redirigía a `/login` para quien no tuviera
     * sesión — un buscador jamás la tiene, así que nunca podían leer el
     * robots ni el sitemap, y un navegador evaluando si el sitio es instalable
     * tampoco: sin poder pedir el manifest y el service worker sin sesión, no
     * hay PWA que valga.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
