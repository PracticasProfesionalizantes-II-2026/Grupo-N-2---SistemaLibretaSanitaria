import {
  Boxes,
  Contact,
  type LucideIcon,
  Receipt,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";

import { VET_BASE } from "@/config/app-routes";

/**
 * Menú del ERP.
 *
 * Ya no alimenta un sidebar propio: el ERP dejó de ser un espacio de trabajo
 * aparte y sus módulos se despliegan como submenú de "Administración", adentro
 * del menú del veterinario. Esta lista es el contenido de ese submenú.
 *
 * Sigue viviendo en su propio archivo y no dentro de `vet-nav.ts` por una razón
 * de trabajo, no de estilo: el sidebar del veterinario lo mantiene quien
 * desarrolla PetCloud y este menú lo mantiene quien desarrolla el ERP. Un
 * archivo compartido que se toca una vez —la entrada "Administración" de
 * `vet-nav.ts`, que mapea esta lista— no genera conflictos. Uno que se toca en
 * cada módulo nuevo, sí.
 *
 * **La portada ya no se lista acá.** Había una entrada "Resumen" que apuntaba a
 * `ERP_BASE`, la misma dirección que el encabezado de "Administración": dos
 * filas del menú para una sola pantalla, y la resolución de la ruta activa
 * necesitaba un caso especial para no encender las dos. Ahora el encabezado de
 * la sección es el que navega a la portada —es un destino además de ser el
 * control que despliega—, así que la dirección aparece una sola vez. Un módulo
 * nuevo se agrega acá y nada más; la portada no se toca.
 *
 * **"Equipo" tampoco se lista acá.** La delegación de módulos —quién puede
 * tocar qué parte del ERP— pasó a ser una tarjeta de "Institución", que es la
 * última entrada de la sección "Administración" en `vet-nav.ts`. Hablaba de las
 * mismas personas que la tabla de profesionales de esa pantalla, así que tener
 * las dos cosas en rutas distintas obligaba a cruzar el menú para responder una
 * sola pregunta. La ruta `…/erp/equipo` se borró; el resto del módulo
 * —`data/team.ts`, `actions/team-actions.ts`, las migraciones 104 y 111— sigue
 * intacto y es lo que esa tarjeta usa.
 */
export const ERP_BASE = `${VET_BASE}/erp`;

export type ErpNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Los módulos que todavía no existen se listan igual, deshabilitados. Que la
   * veterinaria vea el mapa completo del producto que está pagando es
   * información, no ruido — y evita el reclamo de "esto no lo tiene" sobre algo
   * que está en camino.
   */
  proximamente?: boolean;
};

export const erpNav: ErpNavItem[] = [
  { label: "Stock", href: `${ERP_BASE}/stock`, icon: Boxes },
  {
    label: "Ventas",
    href: `${ERP_BASE}/ventas`,
    icon: ShoppingCart,
  },
  {
    label: "Caja",
    href: `${ERP_BASE}/caja`,
    icon: Wallet,
  },
  {
    label: "Clientes",
    href: `${ERP_BASE}/clientes`,
    icon: Contact,
  },
  {
    label: "Compras y proveedores",
    href: `${ERP_BASE}/compras`,
    icon: Truck,
  },
  {
    label: "Facturación",
    href: `${ERP_BASE}/facturacion`,
    icon: Receipt,
    proximamente: true,
  },
];
