import "server-only";

import { sql } from "drizzle-orm";

import { requireErp } from "@/features/erp/lib/erp-session";
import type { Barcode } from "@/features/erp/lib/product-index";
import { getDb, query } from "@/lib/db";

/** Códigos de barra de los productos de la institución. */
export async function listBarcodes(): Promise<Barcode[]> {
  const vet = await requireErp();

  const data = await query<{ product_id: string; code: string }>(
    getDb(),
    sql`select product_id, code from erp.product_barcodes
         where institution_id = ${vet.institucionId}`,
  ).catch((error) => {
    console.error("listBarcodes", error);
    return [];
  });

  return data.map((fila) => ({ productId: fila.product_id, code: fila.code }));
}

export type ProductBarcodeRow = { id: string; code: string };

export async function listBarcodesForProduct(
  productId: string,
): Promise<ProductBarcodeRow[]> {
  const vet = await requireErp();

  return query<ProductBarcodeRow>(
    getDb(),
    sql`select id, code from erp.product_barcodes
         where product_id = ${productId} and institution_id = ${vet.institucionId}
         order by created_at`,
  ).catch((error) => {
    console.error("listBarcodesForProduct", error);
    return [];
  });
}
