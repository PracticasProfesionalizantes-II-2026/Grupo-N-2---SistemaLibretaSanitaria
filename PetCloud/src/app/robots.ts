import type { MetadataRoute } from "next";

import { APP_ROUTES } from "@/config/app-routes";
import { getSiteUrlFromEnv } from "@/lib/site-url";

/**
 * Qué puede recorrer un buscador.
 *
 * Lo que exige sesión sale de `APP_ROUTES`, **no de una lista escrita acá**.
 * `app-routes.ts` existe para que no haya dos enumeraciones de lo mismo.
 *
 * Esto no es una barrera de seguridad: `proxy.ts` ya redirige a quien no tiene
 * sesión. Es para que no queden URLs indexadas que devuelven
 * una redirección al ingreso.
 */

/**
 * Rutas públicas que igual no queremos en un índice. Son la excepción y por eso
 * se enumeran: no salen de ninguna lista existente porque no son privadas.
 */
const PUBLICAS_NO_INDEXABLES = [
  // El perfil del collar es público a propósito para quien encuentra a la
  // mascota. Justamente por eso no puede terminar en un índice donde se lo
  // recorra de corrido: sería un padrón navegable.
  //
  // La barra final es obligatoria acá y no en las demás: `Disallow: /p` es un
  // prefijo, y bloquearía `/para-veterinarias`.
  "/p/",
];

export default function robots(): MetadataRoute.Robots {
  const sitio = getSiteUrlFromEnv();

  // Sin barra final: en robots.txt el patrón es un prefijo, así que `/inicio`
  // cubre `/inicio` y `/inicio/loquesea`. Con la barra solo cubría la
  // segunda, y la pantalla propia quedaba indexable.
  const privadas = [...APP_ROUTES].sort();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...privadas, ...PUBLICAS_NO_INDEXABLES],
      },
    ],
    ...(sitio ? { sitemap: `${sitio}/sitemap.xml`, host: sitio } : {}),
  };
}
