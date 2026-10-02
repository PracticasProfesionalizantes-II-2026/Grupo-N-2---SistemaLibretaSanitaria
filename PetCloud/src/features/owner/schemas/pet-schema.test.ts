import { afterEach, describe, expect, it, vi } from "vitest";

import {
  avisoPesoInusual,
  breedsBySpecies,
  buscarMascotaDuplicada,
  crearPetFormSchema,
  crearPetServerSchema,
  fechaDesdeEdadAproximada,
  normalizarNombreMascota,
  petFormSchema,
  petServerSchema,
} from "@/features/owner/schemas/pet-schema";
import { hoyArgentina, sumarDias } from "@/lib/argentina-time";

afterEach(() => {
  vi.useRealTimers();
});

const MASCOTA_VALIDA = {
  nombre: "Firulais",
  especie: "perro" as const,
  raza: "Mestizo",
  fechaNacimiento: "2023-05-10",
  sexo: "macho" as const,
  pesoKg: 12.5,
  castrado: true,
};

describe("petFormSchema", () => {
  it("acepta el caso mínimo válido", () => {
    expect(petFormSchema.safeParse(MASCOTA_VALIDA).success).toBe(true);
  });

  it("acepta el caso completo con los opcionales", () => {
    const r = petFormSchema.safeParse({
      ...MASCOTA_VALIDA,
      color: "Marrón",
      microchip: "982000123456789",
      tipoSangre: "DEA 1.1 positivo",
      veterinariaCabecera: "Vet San Roque",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un peso de cero", () => {
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, pesoKg: 0 });
    expect(r.success).toBe(false);
  });

  it("rechaza un peso negativo", () => {
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, pesoKg: -3 });
    expect(r.success).toBe(false);
  });

  it("rechaza NaN, que es como llega un campo de peso vacío", () => {
    // El input se registra con `valueAsNumber`: vacío llega como NaN.
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, pesoKg: NaN });
    expect(r.success).toBe(false);
  });

  it("rechaza el peso como texto", () => {
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, pesoKg: "12" });
    expect(r.success).toBe(false);
  });

  it("exige la raza, a diferencia del alta del onboarding", () => {
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, raza: "" });
    expect(r.success).toBe(false);
  });

  it("exige castrado explícito: no tiene default", () => {
    const sinCastrado: Record<string, unknown> = { ...MASCOTA_VALIDA };
    delete sinCastrado.castrado;

    const r = petFormSchema.safeParse(sinCastrado);
    expect(r.success).toBe(false);
  });

  it("rechaza una especie fuera de la lista", () => {
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, especie: "pez" });
    expect(r.success).toBe(false);
  });

  it("rechaza una fecha de nacimiento futura", () => {
    const mañana = sumarDias(hoyArgentina(), 1);
    const r = petFormSchema.safeParse({
      ...MASCOTA_VALIDA,
      fechaNacimiento: mañana,
    });
    expect(r.success).toBe(false);
  });

  it("acepta la fecha de hoy como nacimiento", () => {
    const hoy = hoyArgentina();
    const r = petFormSchema.safeParse({
      ...MASCOTA_VALIDA,
      fechaNacimiento: hoy,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza una fecha de nacimiento demasiado antigua", () => {
    const r = petFormSchema.safeParse({
      ...MASCOTA_VALIDA,
      fechaNacimiento: "1950-01-01",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un peso mayor a 100 kg", () => {
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, pesoKg: 156.5 });
    expect(r.success).toBe(false);
  });

  it("rechaza un nombre con símbolos que no forman parte de un nombre real", () => {
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, nombre: "d/&&" });
    expect(r.success).toBe(false);
  });

  it("acepta nombres reales con acentos, ñ, apóstrofe o guion", () => {
    for (const nombre of ["Ñandú", "O'Malley", "Bella-Luna", "José María"]) {
      const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, nombre });
      expect(r.success, nombre).toBe(true);
    }
  });

  it("rechaza un microchip con letras", () => {
    const r = petFormSchema.safeParse({
      ...MASCOTA_VALIDA,
      microchip: "abc123",
    });
    expect(r.success).toBe(false);
  });

  it("acepta microchip vacío u omitido (es opcional)", () => {
    expect(
      petFormSchema.safeParse({ ...MASCOTA_VALIDA, microchip: "" }).success,
    ).toBe(true);
    expect(petFormSchema.safeParse(MASCOTA_VALIDA).success).toBe(true);
  });
});

describe("breedsBySpecies", () => {
  it("cubre las tres especies que acepta el schema", () => {
    expect(Object.keys(breedsBySpecies).sort()).toEqual([
      "gato",
      "otro",
      "perro",
    ]);
  });

  it("ofrece «Otra» en todas, para lo que no está en la lista", () => {
    for (const [especie, razas] of Object.entries(breedsBySpecies)) {
      expect(razas, especie).toContain("Otra");
    }
  });

  it("no repite razas dentro de una especie", () => {
    for (const [especie, razas] of Object.entries(breedsBySpecies)) {
      expect(new Set(razas).size, especie).toBe(razas.length);
    }
  });
});

describe("nombre y fecha (compartidos con el servidor)", () => {
  it.each(["   ", "...", " - ", "''"])(
    "rechaza un nombre sin letras: %j",
    (nombre) => {
      expect(
        petFormSchema.safeParse({ ...MASCOTA_VALIDA, nombre }).success,
      ).toBe(false);
    },
  );

  it("recorta el nombre", () => {
    const r = petFormSchema.safeParse({ ...MASCOTA_VALIDA, nombre: "  Luna " });
    expect(r.success && r.data.nombre).toBe("Luna");
  });

  it("calcula 'hoy' al validar, no al cargar el módulo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-10T15:00:00Z"));
    expect(
      petFormSchema.safeParse({
        ...MASCOTA_VALIDA,
        fechaNacimiento: "2030-01-10",
      }).success,
    ).toBe(true);
  });

  it("usa el día argentino: a las 23:30 de Argentina, 'mañana UTC' es futuro", () => {
    vi.useFakeTimers();
    // 02:30 UTC del 11/08 = 23:30 del 10/08 en Argentina.
    vi.setSystemTime(new Date("2026-08-11T02:30:00Z"));
    expect(
      petFormSchema.safeParse({
        ...MASCOTA_VALIDA,
        fechaNacimiento: "2026-08-11",
      }).success,
    ).toBe(false);
  });
});

describe("petServerSchema", () => {
  it("acepta el alta del onboarding (sin raza ni peso)", () => {
    expect(
      petServerSchema.safeParse({
        nombre: "Luna",
        especie: "gato",
        sexo: "hembra",
        fechaNacimiento: "2024-01-01",
      }).success,
    ).toBe(true);
  });

  it("rechaza lo que el formulario rechaza si llega", () => {
    expect(
      petServerSchema.safeParse({ ...MASCOTA_VALIDA, pesoKg: -1 }).success,
    ).toBe(false);
    expect(
      petServerSchema.safeParse({
        ...MASCOTA_VALIDA,
        fechaNacimiento: sumarDias(hoyArgentina(), 1),
      }).success,
    ).toBe(false);
    expect(
      petServerSchema.safeParse({ ...MASCOTA_VALIDA, nombre: "   " }).success,
    ).toBe(false);
  });
});

describe("tipo de sangre por especie", () => {
  it("acepta los valores de la especie y vacío (No sé)", () => {
    for (const tipoSangre of ["DEA 1.1 positivo", "DEA 1.1 negativo", ""]) {
      expect(
        petFormSchema.safeParse({ ...MASCOTA_VALIDA, tipoSangre }).success,
      ).toBe(true);
    }
    expect(
      petFormSchema.safeParse({
        ...MASCOTA_VALIDA,
        especie: "gato",
        tipoSangre: "AB",
      }).success,
    ).toBe(true);
  });

  it("rechaza un tipo de otra especie o inventado", () => {
    expect(
      petFormSchema.safeParse({ ...MASCOTA_VALIDA, tipoSangre: "AB" }).success,
    ).toBe(false);
    expect(
      petServerSchema.safeParse({
        ...MASCOTA_VALIDA,
        especie: "otro",
        tipoSangre: "A",
      }).success,
    ).toBe(false);
  });

  it("acepta un valor viejo sin cambios, pero no uno nuevo inventado", () => {
    const schema = crearPetServerSchema({ tipoSangre: "DEA 1.1" });
    expect(
      schema.safeParse({ ...MASCOTA_VALIDA, tipoSangre: "DEA 1.1" }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...MASCOTA_VALIDA, tipoSangre: "DEA 4" }).success,
    ).toBe(false);
  });
});

describe("microchip ISO (15 dígitos)", () => {
  it("acepta 15 dígitos, con o sin espacios", () => {
    expect(
      petFormSchema.safeParse({
        ...MASCOTA_VALIDA,
        microchip: "982000123456789",
      }).success,
    ).toBe(true);
    expect(
      petFormSchema.safeParse({
        ...MASCOTA_VALIDA,
        microchip: "982 000 123 456 789",
      }).success,
    ).toBe(true);
  });

  it("rechaza un chip nuevo de menos de 15 dígitos", () => {
    expect(
      petFormSchema.safeParse({ ...MASCOTA_VALIDA, microchip: "123456789" })
        .success,
    ).toBe(false);
  });

  it("acepta un chip viejo más corto si no cambió", () => {
    const schema = crearPetFormSchema({ microchip: "123456789" });
    expect(
      schema.safeParse({ ...MASCOTA_VALIDA, microchip: "123456789" }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...MASCOTA_VALIDA, microchip: "1234567890" }).success,
    ).toBe(false);
  });
});

describe("fechaDesdeEdadAproximada", () => {
  it("resta años y meses a hoy", () => {
    expect(fechaDesdeEdadAproximada(3, 0, "2026-09-29")).toBe("2023-09-29");
    expect(fechaDesdeEdadAproximada(0, 10, "2026-09-29")).toBe("2025-11-29");
    expect(fechaDesdeEdadAproximada(1, 9, "2026-03-15")).toBe("2024-06-15");
  });

  it("recorta el día cuando el mes no lo tiene", () => {
    expect(fechaDesdeEdadAproximada(0, 1, "2026-03-31")).toBe("2026-02-28");
  });

  it("devuelve null con una edad vacía o imposible", () => {
    expect(fechaDesdeEdadAproximada(0, 0, "2026-09-29")).toBeNull();
    expect(fechaDesdeEdadAproximada(-1, 0, "2026-09-29")).toBeNull();
    expect(fechaDesdeEdadAproximada(1, 12, "2026-09-29")).toBeNull();
    expect(fechaDesdeEdadAproximada(41, 0, "2026-09-29")).toBeNull();
  });

  it("produce una fecha que el schema acepta", () => {
    const fecha = fechaDesdeEdadAproximada(2, 3);
    expect(
      petFormSchema.safeParse({ ...MASCOTA_VALIDA, fechaNacimiento: fecha })
        .success,
    ).toBe(true);
  });
});

describe("avisoPesoInusual", () => {
  it("no avisa dentro del rango habitual", () => {
    expect(avisoPesoInusual("perro", 30)).toBeNull();
    expect(avisoPesoInusual("gato", 4)).toBeNull();
  });

  it("avisa fuera del rango sin bloquear el schema", () => {
    expect(avisoPesoInusual("gato", 15)).toMatch(/poco habitual/);
    expect(avisoPesoInusual("perro", 95)).toMatch(/poco habitual/);
    expect(
      petFormSchema.safeParse({
        ...MASCOTA_VALIDA,
        especie: "gato",
        pesoKg: 15,
      }).success,
    ).toBe(true);
  });

  it("no avisa sin rango para la especie ni sin peso", () => {
    expect(avisoPesoInusual("otro", 50)).toBeNull();
    expect(avisoPesoInusual("perro", Number.NaN)).toBeNull();
  });
});

describe("duplicados por nombre", () => {
  it("normaliza espacios, mayúsculas y acentos", () => {
    expect(normalizarNombreMascota("  Firulaís  ")).toBe("firulais");
    expect(normalizarNombreMascota("Café  con Leche")).toBe("cafe con leche");
  });

  it("encuentra la misma especie con nombre equivalente", () => {
    const mascotas = [
      { id: "1", nombre: "Firulais", especie: "perro" },
      { id: "2", nombre: "Michi", especie: "gato" },
    ];
    expect(
      buscarMascotaDuplicada(mascotas, {
        nombre: "FIRULAÍS ",
        especie: "perro",
      })?.id,
    ).toBe("1");
    expect(
      buscarMascotaDuplicada(mascotas, { nombre: "Firulais", especie: "gato" }),
    ).toBeUndefined();
    expect(
      buscarMascotaDuplicada(
        mascotas,
        { nombre: "Firulais", especie: "perro" },
        "1",
      ),
    ).toBeUndefined();
  });
});
