import { describe, expect, it } from "vitest";

import {
  institutionSchema,
  petBasicsSchema,
} from "@/features/onboarding/schemas/onboarding-schemas";

const MASCOTA_VALIDA = {
  nombre: "Firulais",
  especie: "perro" as const,
  sexo: "macho" as const,
  fechaNacimiento: "2023-05-10",
};

describe("petBasicsSchema", () => {
  it("acepta el caso mínimo válido, sin raza", () => {
    expect(petBasicsSchema.safeParse(MASCOTA_VALIDA).success).toBe(true);
  });

  it("acepta el caso completo con raza", () => {
    const r = petBasicsSchema.safeParse({
      ...MASCOTA_VALIDA,
      raza: "Mestizo",
    });
    expect(r.success).toBe(true);
  });

  it("acepta las tres especies", () => {
    for (const especie of ["perro", "gato", "otro"]) {
      const r = petBasicsSchema.safeParse({ ...MASCOTA_VALIDA, especie });
      expect(r.success, especie).toBe(true);
    }
  });

  it("rechaza una especie fuera de la lista", () => {
    const r = petBasicsSchema.safeParse({
      ...MASCOTA_VALIDA,
      especie: "dinosaurio",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un sexo fuera de la lista", () => {
    const r = petBasicsSchema.safeParse({ ...MASCOTA_VALIDA, sexo: "otro" });
    expect(r.success).toBe(false);
  });

  it("rechaza el nombre vacío", () => {
    const r = petBasicsSchema.safeParse({ ...MASCOTA_VALIDA, nombre: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza la fecha de nacimiento vacía", () => {
    const r = petBasicsSchema.safeParse({
      ...MASCOTA_VALIDA,
      fechaNacimiento: "",
    });
    expect(r.success).toBe(false);
  });
});

const INSTITUCION_VALIDA = {
  nombre: "Vet San Roque",
  direccion: "Av. Mitre 2450",
  telefono: "11 4791-5520",
  email: "contacto@vetsanroque.com.ar",
};

describe("institutionSchema", () => {
  it("acepta el caso válido completo", () => {
    expect(institutionSchema.safeParse(INSTITUCION_VALIDA).success).toBe(true);
  });

  it("rechaza un email inválido", () => {
    const r = institutionSchema.safeParse({
      ...INSTITUCION_VALIDA,
      email: "contacto",
    });
    expect(r.success).toBe(false);
  });

  it("exige los cuatro campos: ninguno es opcional", () => {
    for (const campo of ["nombre", "direccion", "telefono", "email"]) {
      const r = institutionSchema.safeParse({
        ...INSTITUCION_VALIDA,
        [campo]: "",
      });
      expect(r.success, campo).toBe(false);
    }
  });
});
