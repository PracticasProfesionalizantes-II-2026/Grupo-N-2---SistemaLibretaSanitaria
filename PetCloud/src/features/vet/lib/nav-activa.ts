import type { VetNavItem } from "@/config/vet-nav";

/**
 * Qué entrada del menú del veterinario corresponde a la ruta actual.
 *
 * Vive acá y no dentro del componente por una razón concreta: esta regla ya se
 * rompió una vez. El menú del ERP tenía su propia comprobación con un caso
 * especial para la ruta base; al fusionar los dos menús en uno solo, el caso
 * especial se perdió y "Resumen" quedaba resaltado en cada módulo. Separada del
 * JSX se puede probar con una tabla de rutas, que es la única forma de que la
 * próxima vez el error aparezca en rojo y no en la pantalla del veterinario.
 */
/** ¿El pathname cae adentro de este href? */
function cubre(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Cuál de todas las entradas se marca como activa: **gana el href más largo
 * que cubre la ruta actual**, y solo esa.
 *
 * No alcanza con mirar cada entrada por separado, porque en este menú hay
 * prefijos encadenados sobre la misma dirección: el encabezado
 * "Administración" es `/veterinaria/erp`, que a su vez es prefijo de
 * `/veterinaria/erp/stock`. Parado en Stock, una comprobación local marcaría
 * las dos.
 *
 * Devuelve un único href, no una entrada: el encabezado de una sección y uno de
 * sus hijos pueden compartir dirección —"Clínica" y su hijo "Gestión" son los
 * dos `/veterinaria/gestion`—, así que quién de los dos se pinta lo decide el
 * componente, no esta función. La respuesta siempre es el hijo: el encabezado
 * es un control de plegado, no el lugar donde estás parado. Ver `vet-nav.tsx`.
 */
export function hrefActivo(items: VetNavItem[], pathname: string) {
  let ganador: string | null = null;

  for (const item of items) {
    if (
      cubre(item.href, pathname) &&
      item.href.length > (ganador?.length ?? -1)
    ) {
      ganador = item.href;
    }

    for (const hijo of item.hijos ?? []) {
      if (
        cubre(hijo.href, pathname) &&
        hijo.href.length > (ganador?.length ?? -1)
      ) {
        ganador = hijo.href;
      }
    }
  }

  return ganador;
}

/** ¿La pantalla actual está adentro de la sección (el encabezado o cualquier hijo)? */
export function estaDentro(item: VetNavItem, pathname: string) {
  return (
    cubre(item.href, pathname) ||
    (item.hijos ?? []).some((hijo) => cubre(hijo.href, pathname))
  );
}
