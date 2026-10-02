import {
  Boxes,
  Building2,
  CalendarClock,
  LayoutDashboard,
  type LucideIcon,
  PawPrint,
  QrCode,
  Settings,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";

import { VET_BASE } from "@/config/app-routes";
import { ERP_BASE, erpNav } from "@/config/erp-nav";

/**
 * Sidebar del veterinario.
 *
 * El prefijo `/veterinaria` se define en `app-routes.ts` y se reexporta acá
 * porque todo el panel lo importa desde este archivo. Ver ahí el porqué de la
 * mudanza: era la única forma de que este menú pudiera leer los módulos del ERP
 * sin armar un ciclo de importación.
 *
 * El menú está partido en **dos secciones plegables y una entrada suelta**:
 * "Clínica", "Administración" y "Configuración". Solo una sección puede estar
 * abierta a la vez —la que contiene la pantalla actual—, y el motivo es de
 * espacio: con las dos abiertas el sidebar pasaba las diecisiete filas y había
 * que hacer scroll dentro del propio menú. Quien está facturando no necesita
 * ver la sala de espera en pantalla; le alcanza con saber que está a un clic.
 */
export { VET_BASE };

export type VetNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Qué hace esta entrada cuando la institución **no** tiene Premium activo.
   *
   * Son dos comportamientos distintos a propósito, y por eso hay un campo con
   * dos valores en vez de un booleano:
   *
   * - `"oculta"`: la entrada desaparece del menú. Es lo que corresponde a una
   *   funcionalidad suelta de adentro del flujo clínico —hoy "Turnos"—: quien
   *   no la paga no la usa, y listarla apagada entre pantallas que sí funcionan
   *   solo ensucia el recorrido diario. La decisión es de Augusto y se mantiene
   *   tal cual.
   * - `"bloquea"`: la entrada se muestra, con candado y en gris, y lleva a la
   *   pantalla de alta de Premium. Es lo que corresponde al **área** paga
   *   entera —"Administración"—, porque esa área es la superficie de venta: una
   *   veterinaria que no puede ver que existe un área de administración no
   *   tiene forma de enterarse de que hay algo para comprar. Ocultarla era
   *   esconder el producto.
   *
   * En ambos casos el corte es por institución (`session.premium.activo`),
   * nunca por el rol de la persona. Y el alta de Premium no vive en el sidebar
   * sino en el menú del usuario de la topbar, que se ve siempre.
   */
  sinPremium?: "oculta" | "bloquea";
  /**
   * Separa visualmente la entrada del bloque de arriba con una línea. Marca los
   * límites entre secciones: lo clínico, lo administrativo y la configuración
   * de la cuenta son tres modos de trabajo distintos, y leerlos al ras
   * confunde.
   */
  abreEspacioAparte?: boolean;
  /**
   * Las entradas de la sección, que se despliegan en el lugar sin cambiar de
   * cascarón. El panel es uno solo: los módulos del ERP se abren adentro de
   * este mismo menú.
   */
  hijos?: VetNavItem[];
  /**
   * El módulo todavía no existe: se lista igual, deshabilitado. Que la
   * veterinaria vea el mapa completo del producto que está pagando es
   * información, no ruido.
   */
  proximamente?: boolean;
};

export const vetNav: VetNavItem[] = [
  {
    // El encabezado de la sección también navega: lleva a Gestión, que es la
    // portada del área clínica. Ver `vet-nav.tsx` para el reparto entre
    // navegar (la fila) y plegar (el chevron de la derecha).
    label: "Clínica",
    href: `${VET_BASE}/gestion`,
    icon: Stethoscope,
    hijos: [
      { label: "Gestión", href: `${VET_BASE}/gestion`, icon: LayoutDashboard },
      { label: "Escanear QR", href: `${VET_BASE}/escanear`, icon: QrCode },
      {
        label: "Sala de espera",
        href: `${VET_BASE}/sala-de-espera`,
        icon: Users,
      },
      {
        label: "Turnos",
        href: `${VET_BASE}/turnos`,
        icon: CalendarClock,
        sinPremium: "oculta",
      },
      { label: "Pacientes", href: `${VET_BASE}/pacientes`, icon: PawPrint },
      {
        label: "Vacunaciones",
        href: `${VET_BASE}/vacunaciones`,
        icon: Syringe,
      },
    ],
  },
  {
    label: "Administración",
    href: ERP_BASE,
    icon: Boxes,
    // La sección NO se bloquea, aunque casi todo lo que contiene sea pago.
    //
    // Bloquearla entera dejaba a una veterinaria sin Premium sin poder entrar
    // a "Institución" —los datos de su propia clínica y la invitación de
    // profesionales—, que no tiene nada que ver con la suscripción. El candado
    // va módulo por módulo, adentro.
    //
    // Además vende mejor: quien abre la sección ve Institución funcionando y
    // seis módulos con candado al lado. Los candados aparecen cuando alguien
    // fue a buscarlos, no todo el día en pantalla.
    abreEspacioAparte: true,
    hijos: [
      // Los módulos los mantiene `erp-nav.ts`, que es de quien desarrolla el
      // ERP. Mapearlos acá en vez de repetirlos evita que agregar un módulo
      // obligue a tocar este archivo compartido.
      ...erpNav.map((item): VetNavItem => ({
        label: item.label,
        href: item.href,
        icon: item.icon,
        proximamente: item.proximamente,
        // Cada módulo del ERP se bloquea por su cuenta: son lo que se paga.
        sinPremium: "bloquea",
      })),
      // "Institución" cuelga de Administración aunque no sea un módulo del ERP:
      // es una ruta de PetCloud (`/veterinaria/institucion`), así que se agrega
      // acá y no en `erp-nav.ts`, que es la lista del otro desarrollador.
      //
      // Vive en esta sección porque es administración de la veterinaria —datos
      // de la institución, no de un paciente— y porque además de su equipo
      // resuelve la delegación de módulos del ERP: el módulo "Equipo" tenía
      // ruta propia, hablaba de las mismas personas, y se mudó adentro de esta
      // pantalla. Va última, después de los módulos, para no partir el bloque
      // del ERP al medio.
      {
        label: "Institución",
        href: `${VET_BASE}/institucion`,
        icon: Building2,
        // Sin `sinPremium` a propósito: es la única entrada abierta de esta
        // sección. Una veterinaria que todavía no paga tiene que poder cargar
        // sus datos e invitar profesionales igual.
      },
    ],
  },
  {
    // Queda fuera de las dos secciones, al final: no es clínica ni
    // administración del negocio, es la cuenta.
    label: "Configuración",
    href: `${VET_BASE}/configuracion`,
    icon: Settings,
    abreEspacioAparte: true,
  },
];

/**
 * El menú visible para esta sesión.
 *
 * Filtra **solo** las entradas marcadas `sinPremium: "oculta"`, y lo hace
 * también adentro de cada sección, porque hoy la única que se oculta —"Turnos"—
 * es hija de "Clínica", que no es paga.
 *
 * Las entradas `sinPremium: "bloquea"` no se tocan acá a propósito: siguen en
 * la lista y el componente las dibuja con candado. Filtrarlas sería volver a
 * esconder el área que se quiere vender.
 */
export function visibleVetNav(premiumActivo: boolean) {
  const seVe = (item: VetNavItem) =>
    item.sinPremium !== "oculta" || premiumActivo;

  return vetNav.filter(seVe).map((item) =>
    item.hijos
      ? {
          ...item,
          hijos: item.hijos.filter(seVe),
        }
      : item,
  );
}
