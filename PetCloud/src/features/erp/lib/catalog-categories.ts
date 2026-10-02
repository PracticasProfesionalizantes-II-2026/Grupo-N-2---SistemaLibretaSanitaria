/**
 * Códigos canónicos del catálogo compartido → etiqueta en español.
 *
 * Los valores de las claves tienen que coincidir exactamente con los CHECK
 * de `erp.catalog_products.species` y `.product_type` (migración 116). Los
 * códigos son identificadores en inglés, igual criterio que
 * `PRODUCT_UNIT_LABELS` (`types/erp.ts`): la interfaz es en español, el
 * identificador que viaja a la base no.
 */

export const CATALOG_SPECIES = [
  "dog",
  "cat",
  "fish",
  "bird",
  "small_mammal",
  "reptile_amphibian",
  "other",
] as const;

export type CatalogSpecies = (typeof CATALOG_SPECIES)[number];

export const CATALOG_SPECIES_LABELS: Record<CatalogSpecies, string> = {
  dog: "Perros",
  cat: "Gatos",
  fish: "Peces",
  bird: "Aves",
  small_mammal: "Roedores",
  reptile_amphibian: "Reptiles y anfibios",
  other: "Otras especies",
};

export const CATALOG_PRODUCT_TYPES = [
  "food",
  "treats",
  "pharmacy",
  "health",
  "hygiene",
  "accessories",
  "toys",
  "clothing",
  "walking",
  "litter",
  "aquarium",
  "beds_housing",
  "other",
] as const;

export type CatalogProductType = (typeof CATALOG_PRODUCT_TYPES)[number];

export const CATALOG_PRODUCT_TYPE_LABELS: Record<CatalogProductType, string> = {
  food: "Alimentos",
  treats: "Snacks",
  pharmacy: "Farmacia",
  health: "Salud",
  hygiene: "Higiene y belleza",
  accessories: "Accesorios",
  toys: "Juguetes",
  clothing: "Ropa",
  walking: "Correas y collares",
  litter: "Piedras sanitarias",
  aquarium: "Acuario",
  beds_housing: "Camas y transportadoras",
  other: "Varios",
};
