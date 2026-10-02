import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { APP_ROUTES, PUBLIC_ROUTES } from "@/config/app-routes";

/**
 * El seguro de que las dos listas no se separen.
 *
 * `robots.ts` deriva de `APP_ROUTES`, pero derivar no alcanza: alguien puede
 * volver a escribir la lista a mano dentro de seis meses, o agregar una ruta
 * privada al mapa y no darse cuenta de que quedó indexable. Esto lo hace fallar.
 *
 * La regla de robots.txt es de **prefijo**: `Disallow: /inicio` cubre
 * `/inicio` y `/inicio/lo-que-sea`. Esa es la semántica que se comprueba
 * acá, y es la que la versión escrita a mano tenía mal.
 */

const reglas = robots().rules;
const regla = Array.isArray(reglas) ? reglas[0] : reglas;
const DISALLOW = ([] as string[]).concat(regla.disallow ?? []);

/** ¿Alguna regla bloquea esta URL, con la semántica de prefijo de robots.txt? */
function estaBloqueada(pathname: string) {
  return DISALLOW.some((patron) => pathname.startsWith(patron));
}

describe("robots cubre todo lo que exige sesión", () => {
  it.each(APP_ROUTES)("bloquea %s", (ruta) => {
    expect(estaBloqueada(ruta)).toBe(true);
  });

  it.each(APP_ROUTES)("bloquea también lo que cuelga de %s", (ruta) => {
    expect(estaBloqueada(`${ruta}/algo/adentro`)).toBe(true);
  });

  it("no deja ninguna ruta de app afuera", () => {
    const afuera = APP_ROUTES.filter((ruta) => !estaBloqueada(ruta));
    expect(afuera).toEqual([]);
  });
});

describe("robots no se lleva puesto el sitio institucional", () => {
  /** Las públicas que sí queremos indexadas: el resto es excepción declarada. */
  const INDEXABLES = PUBLIC_ROUTES.filter(
    (ruta) => !["/p", "/legales"].includes(ruta),
  );

  it.each(INDEXABLES)("deja pasar %s", (ruta) => {
    expect(estaBloqueada(ruta)).toBe(false);
  });

  it("no bloquea /para-veterinarias", () => {
    // El caso concreto que rompería escribir `/p` sin barra final: es un
    // prefijo.
    expect(estaBloqueada("/para-veterinarias")).toBe(false);
  });

  it("no bloquea la home", () => {
    expect(estaBloqueada("/")).toBe(false);
  });
});

describe("sitemap y robots no se contradicen", () => {
  it("ninguna URL del sitemap está bloqueada en robots", () => {
    // Un sitemap que lista lo que robots prohíbe es una señal contradictoria:
    // Google lo reporta como error en Search Console.
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const rutas = sitemap().map((entrada) =>
      entrada.url.replace("http://localhost:3000", ""),
    );

    expect(rutas.length).toBeGreaterThan(0);
    for (const ruta of rutas) {
      expect(estaBloqueada(ruta || "/"), ruta).toBe(false);
    }
  });

  it("el sitemap no lista ninguna ruta que exija sesión", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const rutas = sitemap().map((entrada) =>
      entrada.url.replace("http://localhost:3000", ""),
    );

    for (const ruta of rutas) {
      const esDeApp = APP_ROUTES.some(
        (app) => ruta === app || ruta.startsWith(`${app}/`),
      );
      expect(esDeApp, ruta).toBe(false);
    }
  });
});
