import { describe, expect, it } from "vitest";

import {
  LIMITES,
  contactSchema,
} from "@/features/public-site/schemas/contact-schema";

/**
 * El schema es la primera de las tres barreras del formulario público (las
 * otras dos son la política de RLS y los CHECK de la 054). Lo que se prueba
 * acá es que rechace lo mismo que rechaza la tabla, para que el error llegue en
 * castellano y señalando el campo en vez de volver como un 23514 sin traducir.
 */

const valido = {
  nombre: "Ana Pérez",
  email: "ana@example.com",
  telefono: "+54 9 11 5555 5555",
  tipo: "dueno" as const,
  mensaje: "Quiero saber cómo sumo a mi veterinaria.",
  aceptaPrivacidad: true as const,
};

describe("contactSchema", () => {
  it("acepta un mensaje mínimo válido", () => {
    const resultado = contactSchema.safeParse(valido);

    expect(resultado.success).toBe(true);
  });

  it("acepta el caso completo con organización y ciudad", () => {
    const resultado = contactSchema.safeParse({
      ...valido,
      organizacion: "Municipio de Vicente López",
      ciudad: "Vicente López",
    });

    expect(resultado.success).toBe(true);
  });

  it("acepta los tres tipos de interesado", () => {
    for (const tipo of ["dueno", "veterinaria", "municipio"]) {
      expect(contactSchema.safeParse({ ...valido, tipo }).success, tipo).toBe(
        true,
      );
    }
  });

  it("recorta los espacios de los campos de texto", () => {
    const resultado = contactSchema.safeParse({
      ...valido,
      nombre: "  Ana Pérez  ",
      mensaje: "  Hola  ",
    });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.nombre).toBe("Ana Pérez");
    expect(resultado.data.mensaje).toBe("Hola");
  });

  it("convierte los campos opcionales vacíos en undefined, no en cadena vacía", () => {
    const resultado = contactSchema.safeParse({
      ...valido,
      organizacion: "",
      ciudad: "   ",
    });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.organizacion).toBeUndefined();
    expect(resultado.data.ciudad).toBeUndefined();
  });

  it("rechaza el nombre vacío", () => {
    expect(contactSchema.safeParse({ ...valido, nombre: "" }).success).toBe(
      false,
    );
  });

  it("rechaza un nombre que es solo espacios", () => {
    expect(contactSchema.safeParse({ ...valido, nombre: "   " }).success).toBe(
      false,
    );
  });

  it("rechaza el mensaje vacío", () => {
    expect(contactSchema.safeParse({ ...valido, mensaje: "" }).success).toBe(
      false,
    );
  });

  it("rechaza el teléfono vacío", () => {
    expect(contactSchema.safeParse({ ...valido, telefono: "" }).success).toBe(
      false,
    );
  });

  it.each([
    "sinarroba",
    "sin@dominio",
    "espacio en@medio.com",
    "@example.com",
    "ana@",
  ])("rechaza el email inválido %s", (email) => {
    expect(contactSchema.safeParse({ ...valido, email }).success).toBe(false);
  });

  it("rechaza un nombre que supera el tope de la tabla", () => {
    const resultado = contactSchema.safeParse({
      ...valido,
      nombre: "a".repeat(LIMITES.nombre + 1),
    });

    expect(resultado.success).toBe(false);
  });

  it("acepta un nombre exactamente en el tope", () => {
    const resultado = contactSchema.safeParse({
      ...valido,
      nombre: "a".repeat(LIMITES.nombre),
    });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un mensaje que supera el tope de la tabla", () => {
    const resultado = contactSchema.safeParse({
      ...valido,
      mensaje: "a".repeat(LIMITES.mensaje + 1),
    });

    expect(resultado.success).toBe(false);
  });

  it("rechaza una organización y una ciudad que superan sus topes", () => {
    expect(
      contactSchema.safeParse({
        ...valido,
        organizacion: "a".repeat(LIMITES.organizacion + 1),
      }).success,
    ).toBe(false);

    expect(
      contactSchema.safeParse({
        ...valido,
        ciudad: "a".repeat(LIMITES.ciudad + 1),
      }).success,
    ).toBe(false);
  });

  it("rechaza un tipo que no es ninguno de los tres del enum", () => {
    expect(
      contactSchema.safeParse({ ...valido, tipo: "hospital" }).success,
    ).toBe(false);
  });

  it("rechaza el envío sin aceptar la política de privacidad", () => {
    expect(
      contactSchema.safeParse({ ...valido, aceptaPrivacidad: false }).success,
    ).toBe(false);
  });
});
