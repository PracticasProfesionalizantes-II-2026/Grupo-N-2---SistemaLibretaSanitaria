import { describe, expect, it } from "vitest";

import { VET_BASE, vetNav, visibleVetNav } from "@/config/vet-nav";

/**
 * Estas pruebas fijan reglas de producto del menú, no su forma.
 *
 * La primera existe por una regresión concreta: al mudar "Institución" adentro
 * de la sección "Administración" —que se bloquea sin Premium— una veterinaria
 * sin suscripción se quedó sin poder editar los datos de su propia clínica ni
 * invitar profesionales. El candado bajó a los módulos del ERP uno por uno, y
 * este test es lo que impide que vuelva a subir a la sección.
 */

function buscar(label: string) {
  for (const item of vetNav) {
    if (item.label === label) return item;
    const hijo = item.hijos?.find((h) => h.label === label);
    if (hijo) return hijo;
  }
  return undefined;
}

describe("qué puede usar una veterinaria sin Premium", () => {
  const sinPremium = visibleVetNav(false);

  it("la sección Administración se ve, no se esconde", () => {
    // Es la superficie de venta: esconderla deja a la veterinaria sin
    // enterarse de que existe algo para comprar.
    expect(sinPremium.map((i) => i.label)).toContain("Administración");
  });

  it("ninguna sección lleva candado: el candado va adentro", () => {
    for (const seccion of sinPremium) {
      expect(seccion.sinPremium).not.toBe("bloquea");
    }
  });

  it("Institución sigue abierta, sin candado", () => {
    const institucion = buscar("Institución");

    expect(institucion?.href).toBe(`${VET_BASE}/institucion`);
    expect(institucion?.sinPremium).toBeUndefined();

    const admin = sinPremium.find((i) => i.label === "Administración");
    expect(admin?.hijos?.map((h) => h.label)).toContain("Institución");
  });

  it("los módulos del ERP sí llevan candado", () => {
    const admin = sinPremium.find((i) => i.label === "Administración");
    const modulos = (admin?.hijos ?? []).filter(
      (h) => h.label !== "Institución",
    );

    expect(modulos.length).toBeGreaterThan(0);
    for (const modulo of modulos) {
      expect(modulo.sinPremium).toBe("bloquea");
    }
  });

  it("Turnos se esconde en vez de bloquearse, y esa diferencia es a propósito", () => {
    // Es una función suelta del flujo clínico, no el área paga entera.
    const clinica = sinPremium.find((i) => i.label === "Clínica");
    expect(clinica?.hijos?.map((h) => h.label)).not.toContain("Turnos");

    const conPremium = visibleVetNav(true).find((i) => i.label === "Clínica");
    expect(conPremium?.hijos?.map((h) => h.label)).toContain("Turnos");
  });
});

describe("qué NO vive en el panel lateral", () => {
  it.each(["Premium", "Campañas", "Catálogo de vacunas"])(
    "%s salió del menú",
    (label) => {
      expect(buscar(label)).toBeUndefined();
    },
  );
});
