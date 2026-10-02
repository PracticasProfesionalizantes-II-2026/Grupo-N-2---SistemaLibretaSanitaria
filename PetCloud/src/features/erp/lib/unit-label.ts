import { PRODUCT_UNIT_LABELS, type ProductUnit } from "@/types/erp";

/**
 * La etiqueta de una unidad, concordada con la cantidad que la acompaña.
 *
 * `PRODUCT_UNIT_LABELS` guarda singulares, así que contar con ella directo
 * produce "quedan 20 kilogramo" en la cara del cliente.
 *
 * El plural se **deriva** del singular en vez de vivir en una segunda tabla, y
 * eso es deliberado: dos listas paralelas son una que tarde o temprano queda
 * corta cuando alguien suma una unidad nueva. La regla cubre las siete
 * etiquetas y la prueba las recorre una por una, así que el día que aparezca
 * una octava que no encaje, el test lo dice antes que un cliente.
 */
export function etiquetaDeUnidad(
  unidad: ProductUnit,
  cantidad: number,
): string {
  const singular = PRODUCT_UNIT_LABELS[unidad];

  // "1 unidad" y "-1 unidad"; el cero va en plural, como se habla.
  if (Math.abs(cantidad) === 1) return singular;

  // "Dosis" ya es plural: en castellano no cambia.
  if (singular.endsWith("s")) return singular;

  return /[aeiou]$/i.test(singular) ? `${singular}s` : `${singular}es`;
}
