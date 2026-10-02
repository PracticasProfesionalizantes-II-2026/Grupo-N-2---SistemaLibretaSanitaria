"use server";

import "server-only";

import { lookupCatalog, type CatalogEntry } from "@/features/erp/data/catalog";

/**
 * Envoltorio de Server Action sobre `lookupCatalog()` (`data/catalog.ts`),
 * para que `ProductModal` (componente de cliente) pueda consultar el
 * catálogo compartido al perder foco, al tipear Enter o al completarse un
 * escaneo — mismo criterio que `listProductBarcodesAction` en
 * `barcode-actions.ts`.
 */
export async function lookupCatalogAction(
  code: string,
): Promise<CatalogEntry | null> {
  return lookupCatalog(code);
}
