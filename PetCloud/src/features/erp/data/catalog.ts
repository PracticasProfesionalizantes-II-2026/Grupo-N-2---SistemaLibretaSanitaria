import "server-only";

import { sql } from "drizzle-orm";

import { normalizeGtin } from "@/features/erp/lib/gtin";
import { requireErp } from "@/features/erp/lib/erp-session";
import { getDb, query } from "@/lib/db";

/**
 * Lectura del catálogo compartido (migración 116, `erp-catalogo-compartido`
 * fase 4). Solo lectura: el alta pasa siempre por `erp.catalog_add()`
 * (`stock-actions.ts`), nunca por un INSERT desde acá.
 */

export type CatalogEntry = {
  id: string;
  name: string;
  species: string | null;
  productType: string;
  presentation: string | null;
  laboratory: string | null;
};

/**
 * Busca una entrada del catálogo por un código escaneado o tipeado.
 *
 * Un código que no normaliza a GTIN nunca dispara consulta: no es una
 * identidad del catálogo compartido, solo un código interno de la
 * institución.
 *
 * La consulta es por PK de `catalog_barcodes.gtin` (índice único de la
 * migración 116): nunca un recorrido completo de la tabla, ni con el
 * catálogo en sus 14.598 filas reales.
 */
export async function lookupCatalog(
  code: string,
): Promise<CatalogEntry | null> {
  const gtin = normalizeGtin(code);
  if (!gtin) return null;

  await requireErp();

  const [entrada] = await query<{
    id: string;
    name: string;
    species: string | null;
    product_type: string;
    presentation: string | null;
    laboratory: string | null;
  }>(
    getDb(),
    sql`select p.id, p.name, p.species, p.product_type, p.presentation, p.laboratory
          from erp.catalog_barcodes b
          join erp.catalog_products p on p.id = b.catalog_product_id
         where b.gtin = ${gtin} limit 1`,
  ).catch((error) => {
    console.error("lookupCatalog", error);
    return [];
  });

  if (!entrada) return null;

  return {
    id: entrada.id,
    name: entrada.name,
    species: entrada.species,
    productType: entrada.product_type,
    presentation: entrada.presentation,
    laboratory: entrada.laboratory,
  };
}
