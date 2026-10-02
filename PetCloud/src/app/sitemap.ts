import type { MetadataRoute } from "next";

import { getSiteUrlFromEnv } from "@/lib/site-url";

/**
 * Solo el sitio institucional.
 *
 * Todo lo que está detrás de una sesión queda afuera a propósito: los paneles
 * del dueño, la veterinaria, el municipio y el backoffice no tienen nada que
 * hacer en un buscador, y `/p/[qrCode]` menos que ninguno — es la ficha de un
 * animal concreto, y listarla convertiría el sitemap en un padrón público.
 *
 * Las rutas se escriben a mano y no se derivan del árbol de `app/`: que una
 * página nueva entre al sitemap tiene que ser una decisión, no un efecto
 * secundario de crear un archivo.
 */
const RUTAS_PUBLICAS = [
  { ruta: "/", prioridad: 1, frecuencia: "monthly" },
  { ruta: "/como-funciona", prioridad: 0.8, frecuencia: "monthly" },
  { ruta: "/para-veterinarias", prioridad: 0.8, frecuencia: "monthly" },
  { ruta: "/nosotros", prioridad: 0.5, frecuencia: "yearly" },
  { ruta: "/contacto", prioridad: 0.5, frecuencia: "yearly" },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  // Sin dominio configurado no hay sitemap que valga: una URL relativa no le
  // sirve a ningún buscador, y publicar localhost es peor que no publicar.
  const sitio = getSiteUrlFromEnv();
  if (!sitio) return [];

  const ahora = new Date();

  return RUTAS_PUBLICAS.map(({ ruta, prioridad, frecuencia }) => ({
    url: `${sitio}${ruta}`,
    lastModified: ahora,
    changeFrequency: frecuencia,
    priority: prioridad,
  }));
}
