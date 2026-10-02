"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ERP_BASE } from "@/config/erp-nav";
import type { ActionResult } from "@/features/erp/actions/stock-actions";
import {
  listBarcodesForProduct,
  type ProductBarcodeRow,
} from "@/features/erp/data/barcodes";
import { requireErp } from "@/features/erp/lib/erp-session";
import {
  addBarcodeSchema,
  removeBarcodeSchema,
  type AddBarcodeValues,
  type RemoveBarcodeValues,
} from "@/features/erp/schemas/barcode-schemas";
import { erpWrite } from "@/features/erp/lib/erp-sql";
import { insertInto } from "@/lib/db";
import type { Database } from "@/types/supabase";

/**
 * Escrituras del módulo de códigos de barra (migración 113).
 *
 * `requireErp()` primero, mismo criterio que `stock-actions.ts`. No hay
 * `updateBarcode`: un código se reemplaza por baja + alta: la tabla ni siquiera tiene política de UPDATE.
 */

const ERROR_GENERICO = "No pudimos guardar el cambio. Probá de nuevo.";
const DATOS_INVALIDOS =
  "Revisá los datos: falta algo o el formato no es válido.";

type BarcodeInsert = Omit<
  Database["erp"]["Tables"]["product_barcodes"]["Insert"],
  "created_at"
>;

function revalidarBarcodes(productId?: string) {
  revalidatePath(`${ERP_BASE}/ventas`);
  revalidatePath(`${ERP_BASE}/stock`);
  if (productId) revalidatePath(`${ERP_BASE}/stock/${productId}`);
}

/**
 * `23505` es la violación del índice único `(institution_id, code)`: acá
 * solo puede venir de un código ya registrado por la misma institución
 * (para cualquier producto). Se traduce al campo que la persona escribió,
 * mismo criterio que `esSkuDuplicado()` en `stock-actions.ts`.
 */
function esCodigoDuplicado(codigo?: string) {
  return codigo === "23505";
}

/**
 * Envoltorio de Server Action sobre `listBarcodesForProduct()`
 * (`data/barcodes.ts`), para que `ProductModal` (componente de cliente)
 * pueda pedir los códigos de un producto puntual al editarlo — mismo
 * criterio que `getSaleAction()`.
 */
export async function listProductBarcodesAction(
  productId: string,
): Promise<ProductBarcodeRow[]> {
  return listBarcodesForProduct(productId);
}

export async function addBarcode(
  input: AddBarcodeValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = addBarcodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      insertInto("erp.product_barcodes", {
        institution_id: vet.institucionId,
        product_id: valores.productoId,
        code: valores.codigo,
      } satisfies BarcodeInsert),
    ),
  );

  if (error) {
    if (esCodigoDuplicado(error.code)) {
      return {
        ok: false,
        error: "Ya tenés un código igual registrado en otro producto.",
        campo: "codigo",
      };
    }

    console.error("addBarcode", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarBarcodes(valores.productoId);
  return { ok: true };
}

export async function removeBarcode(
  input: RemoveBarcodeValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = removeBarcodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      sql`delete from erp.product_barcodes
           where id = ${parsed.data.id} and institution_id = ${vet.institucionId}`,
    ),
  );

  if (error) {
    console.error("removeBarcode", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarBarcodes();
  return { ok: true };
}
