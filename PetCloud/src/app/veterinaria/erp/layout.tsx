import { requireErp } from "@/features/erp/lib/erp-session";

/**
 * Todo el ERP entra por acá.
 *
 * `requireErp()` en el layout y no en cada página: es el corte más alto
 * posible del árbol, así que ninguna pantalla nueva puede olvidarse de pedirlo.
 * Las acciones y las lecturas lo vuelven a exigir igual —un layout no protege
 * una Server Action, que se invoca por su cuenta— y la base lo exige una
 * tercera vez con `erp.has_access()`.
 *
 * POR QUÉ ESTA CARPETA VOLVIÓ A `app/veterinaria/erp/` DESPUÉS DE HABER VIVIDO
 * EN EL GRUPO DE RUTAS `app/(erp)/`:
 *
 * Porque cambió la decisión de producto, no porque el motivo anterior fuera
 * falso. El ERP era un espacio de trabajo aparte, con su propio cascarón y su
 * propio menú, y el grupo `(erp)` existía justamente para sacarlo de abajo de
 * `app/veterinaria/layout.tsx` y evitar que se dibujaran dos menús anidados.
 *
 * Hoy el ERP no es otro espacio: es el área de administración del mismo panel
 * veterinario. Sus módulos se despliegan como submenú de "Administración",
 * adentro del único sidebar que existe. Que los layouts de Next se aniden pasó
 * de ser el problema a ser exactamente lo que queremos: el cascarón del
 * veterinario es el que tiene que envolver estas pantallas, y este layout ya no
 * dibuja ninguno propio.
 *
 * Esto revierte la decisión anterior a propósito. Si alguien encuentra el
 * comentario viejo en el historial, que no "arregle" nada volviendo a crear
 * `(erp)`: eso traería de vuelta el espacio de trabajo separado que decidimos
 * dejar atrás.
 */
export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireErp();

  return children;
}
