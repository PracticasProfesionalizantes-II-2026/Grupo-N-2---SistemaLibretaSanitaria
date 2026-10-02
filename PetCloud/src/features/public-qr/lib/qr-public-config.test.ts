import { describe, expect, it } from "vitest";

import {
  parseQrPublicConfig,
  QR_PUBLIC_DEFAULTS,
  qrPublicConfigPatchSchema,
  type QrPublicConfig,
} from "@/features/public-qr/lib/qr-public-config";
import {
  proyectarMascotaPublica,
  type PublicPetRow,
} from "@/features/public-qr/lib/public-pet-projection";

describe("parseQrPublicConfig", () => {
  it("una fila vieja, solo con show_owner_contact, conserva lo que se veía", () => {
    expect(parseQrPublicConfig({ show_owner_contact: true })).toEqual({
      ...QR_PUBLIC_DEFAULTS,
      show_owner_contact: true,
    });
  });

  it("los defaults son los de la ficha de antes: microchip oculto, el resto visible", () => {
    const config = parseQrPublicConfig({});
    expect(config.show_microchip).toBe(false);
    expect(config.show_owner_contact).toBe(false);
    expect(config.show_photo).toBe(true);
    expect(config.show_markings).toBe(true);
    expect(config.show_neutered).toBe(true);
  });

  it("descarta claves desconocidas y valores no booleanos", () => {
    const config = parseQrPublicConfig({
      show_photo: "no",
      hack: true,
      show_age: false,
    });
    expect(config).not.toHaveProperty("hack");
    expect(config.show_photo).toBe(true);
    expect(config.show_age).toBe(false);
  });

  it("cualquier cosa que no sea un objeto devuelve los defaults", () => {
    for (const raw of [null, undefined, "x", 3, [true]]) {
      expect(parseQrPublicConfig(raw)).toEqual(QR_PUBLIC_DEFAULTS);
    }
  });
});

describe("qrPublicConfigPatchSchema", () => {
  it("acepta un cambio parcial", () => {
    expect(
      qrPublicConfigPatchSchema.safeParse({ show_photo: false }).success,
    ).toBe(true);
  });

  it("rechaza claves desconocidas y valores no booleanos", () => {
    expect(qrPublicConfigPatchSchema.safeParse({ owner_id: "x" }).success).toBe(
      false,
    );
    expect(
      qrPublicConfigPatchSchema.safeParse({ show_age: "true" }).success,
    ).toBe(false);
  });
});

const FILA: PublicPetRow = {
  name: "Toby",
  species: "dog",
  breed: "Mestizo",
  sex: "male",
  date_of_birth: "2020-01-01",
  color: "Negro con mancha blanca",
  neutered: true,
  photo_url: "https://x/perfil.jpg",
  qr_code: "PC-AAAA-BBBB",
  municipal_registry_number: "MUN-123",
  microchip_number: "985112345678901",
};

const SALUD = {
  estadoSanitario: "al-dia",
  estadoAntirrabica: "vencida",
} as const;

const TODO_OCULTO: QrPublicConfig = {
  show_owner_contact: false,
  show_photo: false,
  show_species_breed_sex: false,
  show_age: false,
  show_vaccination: false,
  show_municipal_registry: false,
  show_microchip: false,
  show_markings: false,
  show_neutered: false,
};

describe("proyectarMascotaPublica", () => {
  it("con los defaults sale lo mismo que antes y el microchip no", () => {
    const pet = proyectarMascotaPublica(FILA, QR_PUBLIC_DEFAULTS, SALUD);
    expect(pet).toMatchObject({
      nombre: "Toby",
      especie: "perro",
      raza: "Mestizo",
      sexo: "macho",
      color: "Negro con mancha blanca",
      castrado: true,
      fotoUrl: "https://x/perfil.jpg",
      registroMunicipal: "MUN-123",
      estadoSanitario: "al-dia",
      estadoAntirrabica: "vencida",
    });
    expect(pet.microchip).toBeNull();
  });

  it("lo oculto no viaja: ningún valor de la fila aparece salvo nombre y collar", () => {
    const pet = proyectarMascotaPublica(FILA, TODO_OCULTO, SALUD);
    expect(pet).toEqual({
      nombre: "Toby",
      qrCode: "PC-AAAA-BBBB",
      especie: null,
      raza: null,
      sexo: null,
      fechaNacimiento: null,
      color: null,
      castrado: null,
      fotoUrl: null,
      registroMunicipal: null,
      microchip: null,
      estadoSanitario: null,
      estadoAntirrabica: null,
    });
    const serializado = JSON.stringify(pet);
    for (const secreto of [
      "Mestizo",
      "Negro",
      "MUN-123",
      "985112345678901",
      "perfil.jpg",
      "2020-01-01",
    ]) {
      expect(serializado).not.toContain(secreto);
    }
  });

  it("el microchip sale solo si el dueño lo habilita", () => {
    const pet = proyectarMascotaPublica(
      FILA,
      { ...QR_PUBLIC_DEFAULTS, show_microchip: true },
      SALUD,
    );
    expect(pet.microchip).toBe("985112345678901");
  });
});
