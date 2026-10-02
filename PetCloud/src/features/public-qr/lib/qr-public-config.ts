import { z } from "zod";

/**
 * Qué datos de la mascota muestra la ficha pública del collar (`/p/[code]`).
 *
 * Vive en `pets.qr_public_config` (JSONB, migración 002). Las claves van en
 * `snake_case` con prefijo `show_`, igual que la única que existía desde el
 * principio, `show_owner_contact`: esa no se renombra para no romper filas
 * viejas, y las nuevas siguen su estilo para que el JSON se lea parejo.
 *
 * Los valores por defecto son exactamente lo que la ficha mostraba antes de
 * que existiera esta configuración. Una fila vieja —que solo tiene
 * `show_owner_contact`— se sigue viendo igual hasta que el dueño toque algo.
 *
 * El nombre no está acá: siempre es visible, identifica a la mascota.
 */
export type QrPublicConfig = {
  /** Hoy no se lee en ningún lado: el contacto sale solo con búsqueda activa. */
  show_owner_contact: boolean;
  show_photo: boolean;
  show_species_breed_sex: boolean;
  show_age: boolean;
  /** Los dos chips: antirrábica y vacunación general. */
  show_vaccination: boolean;
  show_municipal_registry: boolean;
  show_microchip: boolean;
  /** Color y señas particulares (`pets.color`). */
  show_markings: boolean;
  show_neutered: boolean;
};

export type QrPublicField = Exclude<keyof QrPublicConfig, "show_owner_contact">;

export const QR_PUBLIC_DEFAULTS: QrPublicConfig = {
  show_owner_contact: false,
  show_photo: true,
  show_species_breed_sex: true,
  show_age: true,
  show_vaccination: true,
  show_municipal_registry: true,
  // La ficha nunca mostró el microchip: sigue oculto hasta que el dueño elija.
  show_microchip: false,
  show_markings: true,
  show_neutered: true,
};

/** Ausente o no booleano: cae al default de esa clave, no rompe la ficha. */
const flag = (valor: boolean) => z.boolean().catch(valor);

const schema = z.object({
  show_owner_contact: flag(QR_PUBLIC_DEFAULTS.show_owner_contact),
  show_photo: flag(QR_PUBLIC_DEFAULTS.show_photo),
  show_species_breed_sex: flag(QR_PUBLIC_DEFAULTS.show_species_breed_sex),
  show_age: flag(QR_PUBLIC_DEFAULTS.show_age),
  show_vaccination: flag(QR_PUBLIC_DEFAULTS.show_vaccination),
  show_municipal_registry: flag(QR_PUBLIC_DEFAULTS.show_municipal_registry),
  show_microchip: flag(QR_PUBLIC_DEFAULTS.show_microchip),
  show_markings: flag(QR_PUBLIC_DEFAULTS.show_markings),
  show_neutered: flag(QR_PUBLIC_DEFAULTS.show_neutered),
});

/**
 * Lee lo que haya en la columna. Tolera claves faltantes (filas viejas) y
 * desconocidas (se descartan). Cualquier cosa que no sea un objeto devuelve los
 * defaults.
 */
export function parseQrPublicConfig(raw: unknown): QrPublicConfig {
  const objeto =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return schema.parse(objeto);
}

/** Lo que acepta la acción: un cambio parcial, solo claves conocidas. */
export const qrPublicConfigPatchSchema = z
  .object({
    show_owner_contact: z.boolean(),
    show_photo: z.boolean(),
    show_species_breed_sex: z.boolean(),
    show_age: z.boolean(),
    show_vaccination: z.boolean(),
    show_municipal_registry: z.boolean(),
    show_microchip: z.boolean(),
    show_markings: z.boolean(),
    show_neutered: z.boolean(),
  })
  .partial()
  .strict();

export type QrPublicConfigPatch = z.infer<typeof qrPublicConfigPatchSchema>;
