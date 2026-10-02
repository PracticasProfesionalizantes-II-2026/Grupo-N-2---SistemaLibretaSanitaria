import {
  Boxes,
  Building2,
  LayoutDashboard,
  PawPrint,
  Stethoscope,
  Syringe,
} from "lucide-react";
import { describe, expect, it } from "vitest";

import type { VetNavItem } from "@/config/vet-nav";
import { estaDentro, hrefActivo } from "@/features/vet/lib/nav-activa";

/**
 * Estas pruebas existen por un error concreto, no por cobertura.
 *
 * Cuando el ERP tenía su propio menú, su componente resolvía la ruta activa
 * con un caso especial para la portada: `ERP_BASE` es prefijo de todos los
 * módulos, así que solo valía la coincidencia exacta. Al fusionar los dos
 * menús, "Resumen" pasó a ser un hijo más y perdió ese caso especial: parado
 * en Stock quedaban resaltados los dos.
 *
 * La regla que lo reemplaza es global —gana el href más largo que cubre la
 * ruta— y la tabla de abajo usa la forma real del menú: dos secciones
 * plegables, cada una con sus hijos, y un encabezado que comparte dirección con
 * uno de ellos ("Clínica" y "Gestión").
 */

const nav: VetNavItem[] = [
  {
    label: "Clínica",
    href: "/veterinaria/gestion",
    icon: Stethoscope,
    hijos: [
      { label: "Gestión", href: "/veterinaria/gestion", icon: LayoutDashboard },
      { label: "Pacientes", href: "/veterinaria/pacientes", icon: PawPrint },
      {
        label: "Vacunaciones",
        href: "/veterinaria/vacunaciones",
        icon: Syringe,
      },
    ],
  },
  {
    label: "Administración",
    href: "/veterinaria/erp",
    icon: Boxes,
    hijos: [
      { label: "Stock", href: "/veterinaria/erp/stock", icon: Boxes },
      { label: "Ventas", href: "/veterinaria/erp/ventas", icon: Boxes },
      {
        label: "Institución",
        href: "/veterinaria/institucion",
        icon: Building2,
      },
    ],
  },
];

const clinica = nav[0];
const admin = nav[1];

describe("gana el href más largo que cubre la ruta", () => {
  it.each([
    ["/veterinaria/pacientes", "/veterinaria/pacientes"],
    // Una ficha adentro de Pacientes sigue marcando Pacientes.
    ["/veterinaria/pacientes/abc-123/historial", "/veterinaria/pacientes"],
    ["/veterinaria/erp/stock", "/veterinaria/erp/stock"],
    ["/veterinaria/erp/ventas", "/veterinaria/erp/ventas"],
    // "Institución" se mudó a Administración sin dejar de ser una ruta de
    // PetCloud: no cuelga de `/veterinaria/erp`, así que nada la puede tapar.
    ["/veterinaria/institucion", "/veterinaria/institucion"],
  ])("en %s se marca %s", (pathname, esperado) => {
    expect(hrefActivo(nav, pathname)).toBe(esperado);
  });

  it("estando en un módulo NO se marca también la portada del ERP", () => {
    // El error original: `/veterinaria/erp` es prefijo de `/veterinaria/erp/stock`.
    expect(hrefActivo(nav, "/veterinaria/erp/stock")).not.toBe(
      "/veterinaria/erp",
    );
  });

  it("en la portada del ERP gana la portada, no un módulo suelto", () => {
    // `/veterinaria/erp` es solo el encabezado de la sección, que el componente
    // nunca pinta. Acá lo que importa es que ningún módulo hijo se quede con la
    // marca.
    expect(hrefActivo(nav, "/veterinaria/erp")).toBe("/veterinaria/erp");
  });

  it("el encabezado de Clínica no le roba la marca a su hijo Gestión", () => {
    // Los dos son `/veterinaria/gestion`: la función devuelve el href, y quién
    // de los dos se pinta lo decide el componente.
    expect(hrefActivo(nav, "/veterinaria/gestion")).toBe(
      "/veterinaria/gestion",
    );
  });

  it("un prefijo que no cierra en la barra no cuenta", () => {
    // `/veterinaria/erpx` empieza igual que `/veterinaria/erp` pero es otra
    // ruta: sin el `/` del final, `startsWith` la daría por adentro.
    expect(hrefActivo(nav, "/veterinaria/erpx")).toBeNull();
  });

  it("una ruta fuera del menú no marca nada", () => {
    // "Configuración" queda fuera de las dos secciones, así que este menú de
    // prueba no la lista.
    expect(hrefActivo(nav, "/veterinaria/configuracion")).toBeNull();
  });
});

describe("estaDentro, que es lo que abre la sección y enciende el rail", () => {
  it.each([
    "/veterinaria/erp",
    "/veterinaria/erp/stock",
    "/veterinaria/erp/ventas",
    // Institución abre Administración aunque no comparta prefijo con el ERP.
    "/veterinaria/institucion",
  ])("%s está adentro de Administración", (pathname) => {
    expect(estaDentro(admin, pathname)).toBe(true);
  });

  it.each(["/veterinaria/gestion", "/veterinaria/pacientes"])(
    "%s está adentro de Clínica",
    (pathname) => {
      expect(estaDentro(clinica, pathname)).toBe(true);
    },
  );

  it("una pantalla clínica no abre la sección de administración", () => {
    expect(estaDentro(admin, "/veterinaria/pacientes")).toBe(false);
  });

  it("una pantalla de administración no abre la sección clínica", () => {
    // Es lo que hace que el acordeón muestre una sola hoja abierta: entrar a
    // Stock tiene que dejar Clínica cerrada.
    expect(estaDentro(clinica, "/veterinaria/erp/stock")).toBe(false);
    expect(estaDentro(clinica, "/veterinaria/institucion")).toBe(false);
  });
});
