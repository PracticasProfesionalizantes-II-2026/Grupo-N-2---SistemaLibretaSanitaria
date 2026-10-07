import { gtinKey } from "@/features/erp/lib/gtin";
import type { Product } from "@/types/erp";

/**
 * Índice en memoria para resolver un código escaneado o tipeado a un
 * producto, sin viajar al servidor.
 *
 * Puro: no lee de la base, no conoce React. `sales/page.tsx` ya trae el
 * catálogo completo con `listProducts()`; una nueva `listBarcodes()` (Fase
 * 2.2) suma los códigos al mismo `Promise.all`, y el índice se construye una
 * vez por render con `useMemo`.
 *
 * Normalización GTIN: tanto el código almacenado como el código escaneado se
 * indexan por `gtinKey`, que es el GTIN-14 normalizado cuando el código es
 * un GTIN válido (todo dígitos, largo 8/12/13/14, dígito verificador
 * correcto), o el propio código recortado si no lo es. Así una misma
 * lectura UPC-A guardada como 12 o 13 dígitos resuelve al mismo producto sin
 * reescribir el código almacenado en `erp.product_barcodes`. Regla de
 * colisión: si dos códigos guardados de una institución normalizan a la
 * misma clave, gana el primero según el orden de `listBarcodes()` (son, por
 * definición, el mismo GTIN).
 */

export type Barcode = { productId: string; code: string };

export type ProductIndex = {
  /** Búsqueda exacta: el camino del escáner. */
  byCode: Map<string, string>;
  /**
   * Búsqueda por substring sobre nombre, `sku` y categoría — el fallback
   * tipeado (erp-sales spec, sin `description`: `erp.products` no tiene esa
   * columna, 101:41-73).
   */
  haystack: Array<{ productId: string; normalized: string }>;
};

/**
 * Sin diacríticos ni mayúsculas, para que "vacuna" encuentre "Vacuna" y
 * "antirrábica" encuentre "antirrabica". Variante local de la técnica de
 * `municipality-slug.ts:22-24` (NFD + strip de combinantes); no se reutiliza
 * esa función porque `slugify()` colapsa todo a guiones y minúsculas para un
 * identificador, y una búsqueda por substring necesita conservar espacios.
 */
function normalizar(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function buildProductIndex(
  products: Product[],
  barcodes: Barcode[],
): ProductIndex {
  const byCode = new Map<string, string>();
  for (const { code, productId } of barcodes) {
    const key = gtinKey(code);
    if (!byCode.has(key)) {
      byCode.set(key, productId);
    }
  }

  const haystack = products.map((product) => ({
    productId: product.id,
    normalized: normalizar(
      [product.nombre, product.sku, product.categoria]
        .filter(Boolean)
        .join(" "),
    ),
  }));

  return { byCode, haystack };
}

/** Resolución exacta por código de barras. `undefined` si no hay match. */
export function resolveByCode(
  index: ProductIndex,
  code: string,
): string | undefined {
  return index.byCode.get(gtinKey(code));
}

/**
 * Búsqueda por nombre, `sku` o categoría. Devuelve los ids de producto que
 * contienen el término, en el orden en que aparecen en el catálogo — no hay
 * ranking de relevancia: un mostrador con decenas de resultados ya alcanza a
 * mirarlos todos.
 */
export function searchProducts(index: ProductIndex, query: string): string[] {
  const termino = normalizar(query);
  if (termino.length === 0) return [];

  return index.haystack
    .filter((fila) => fila.normalized.includes(termino))
    .map((fila) => fila.productId);
}
