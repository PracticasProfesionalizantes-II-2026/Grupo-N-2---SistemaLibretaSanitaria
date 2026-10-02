import type { EstadoAntirrabica } from "@/features/public-qr/lib/rabies-status";
import type { QrPublicConfig } from "@/features/public-qr/lib/qr-public-config";
import type { HealthStatus, Sex, Species } from "@/types/pet";

/**
 * De la fila de `pets` a lo que sale hacia el navegador, aplicando la
 * privacidad que eligió el dueño (`qr_public_config`).
 *
 * Un campo oculto no llega "vacío": llega `null`, y la ficha no dibuja ni el
 * rótulo. Esta función es pura a propósito, para poder probar que lo oculto no
 * viaja.
 */

const ESPECIE: Record<string, Species> = {
  dog: "perro",
  cat: "gato",
  other: "otro",
};

const SEXO: Record<string, Sex> = { male: "macho", female: "hembra" };

export type PublicPet = {
  nombre: string;
  especie: Species | null;
  raza: string | null;
  sexo: Sex | null;
  fechaNacimiento: string | null;
  color: string | null;
  castrado: boolean | null;
  fotoUrl: string | null;
  qrCode: string;
  registroMunicipal: string | null;
  microchip: string | null;
  /** Semáforo de TODAS las vacunas, sin el detalle que lo produce. */
  estadoSanitario: HealthStatus | null;
  /**
   * Antirrábica, y solo ella: es la única con interés legítimo para un tercero
   * —quien fue mordido tiene que decidir si buscar profilaxis— y cuenta
   * únicamente con dosis firmadas por un veterinario.
   */
  estadoAntirrabica: EstadoAntirrabica | null;
};

export type PublicPetRow = {
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  date_of_birth: string | null;
  color: string | null;
  neutered: boolean;
  photo_url: string | null;
  qr_code: string;
  municipal_registry_number: string | null;
  microchip_number: string | null;
};

export function proyectarMascotaPublica(
  fila: PublicPetRow,
  config: QrPublicConfig,
  salud: {
    estadoSanitario: HealthStatus;
    estadoAntirrabica: EstadoAntirrabica;
  } | null,
): PublicPet {
  const identidad = config.show_species_breed_sex;
  const vacunas = config.show_vaccination && salud;

  return {
    nombre: fila.name,
    especie: identidad ? (ESPECIE[fila.species] ?? "otro") : null,
    raza: identidad ? (fila.breed ?? "") : null,
    sexo: identidad && fila.sex ? (SEXO[fila.sex] ?? null) : null,
    fechaNacimiento: config.show_age ? (fila.date_of_birth ?? "") : null,
    color: config.show_markings ? (fila.color ?? "") : null,
    castrado: config.show_neutered ? fila.neutered : null,
    fotoUrl: config.show_photo ? fila.photo_url : null,
    qrCode: fila.qr_code,
    registroMunicipal: config.show_municipal_registry
      ? fila.municipal_registry_number
      : null,
    microchip: config.show_microchip ? fila.microchip_number : null,
    estadoSanitario: vacunas ? vacunas.estadoSanitario : null,
    estadoAntirrabica: vacunas ? vacunas.estadoAntirrabica : null,
  };
}
