import type { NextConfig } from "next";

/**
 * Orígenes desde los que se aceptan Server Actions.
 *
 * Next compara el `Origin` del navegador contra el `Host` (o `X-Forwarded-Host`
 * si hay un proxy delante) y rechaza la petición si no coinciden: es su
 * protección contra CSRF. Al abrir la aplicación por un túnel de desarrollo el
 * host reenviado es el del túnel mientras el origen sigue siendo `localhost`,
 * así que **toda** Server Action responde 500 — el login, el registro, todo. En
 * la pantalla se ve como un formulario que no hace nada, sin ningún mensaje que
 * explique por qué.
 *
 * El comodín `*.devtunnels.ms` va solo en desarrollo: el nombre del túnel cambia
 * cada vez que se abre uno, y listar el de hoy obligaría a editar este archivo
 * mañana. En producción la lista se queda en el dominio real, que es donde esta
 * protección importa de verdad.
 *
 * `DEV_TUNNEL_HOST` cubre los túneles de otros proveedores (ngrok, Cloudflare),
 * que no comparten un dominio común.
 */
const esDesarrollo = process.env.NODE_ENV !== "production";

const allowedOrigins = [
  "localhost:3000",
  esDesarrollo ? "*.devtunnels.ms" : null,
  process.env.DEV_TUNNEL_HOST,
].filter((origin): origin is string => Boolean(origin));

/**
 * Cuánto puede pesar el cuerpo de una Server Action.
 *
 * El valor por defecto de Next es **1 MB**, y la aplicación promete 5 MB en
 * tres lugares: el texto debajo de cada selector de imagen, la validación de
 * `ImageUpload` y la de las acciones de `photo-actions.ts`. Cualquier foto
 * sacada con un celular pesa entre 2 y 4 MB, así que caía siempre en esa
 * grieta: la petición moría en el framework, antes de llegar a nuestro código.
 *
 * Y el fallo no se veía como un error de tamaño. Next rechaza la petición
 * lanzando `Error: Body exceeded 1 MB limit.` en la consola del navegador,
 * mientras la Server Action rechaza su promesa sin devolver un `ActionResult`;
 * en pantalla no aparecía ningún mensaje. Al guardar una mascota nueva con
 * foto, la mascota quedaba creada, la foto no subía y el formulario se quedaba
 * abierto y mudo.
 *
 * 6 MB y no 5: el `multipart/form-data` suma el resto de los campos y los
 * encabezados de cada parte, así que un archivo de exactamente 5 MB viaja en un
 * cuerpo algo más grande. El margen evita rechazar justo lo que la interfaz
 * dijo que aceptaba.
 */
const nextConfig: NextConfig = {
  // Las fotos se sirven desde `/api/storage` (ver `src/lib/storage`): van tal
  // cual, sin el optimizador de `next/image`.
  images: { unoptimized: true },
  experimental: {
    serverActions: { allowedOrigins, bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
