"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ERP_BASE } from "@/config/erp-nav";
import type { ActionResult } from "@/features/erp/actions/stock-actions";
import { requireErp } from "@/features/erp/lib/erp-session";
import {
  purchaseSchema,
  supplierSchema,
  type PurchaseValues,
  type SupplierValues,
} from "@/features/erp/schemas/purchase-schemas";
import { erpWrite } from "@/features/erp/lib/erp-sql";
import { insertInto, rpc, updateSet } from "@/lib/db";
import type { Database } from "@/types/supabase";

/**
 * Escrituras del módulo de Compras (migración 105).
 *
 * Mismo criterio que `stock-actions.ts`: `requireErp()` primero, no por
 * redundancia con RLS sino porque devuelve un mensaje de PetCloud en vez del
 * error crudo de PostgreSQL.
 */

const ERROR_GENERICO = "No pudimos guardar el cambio. Probá de nuevo.";
const DATOS_INVALIDOS =
  "Revisá los datos: falta algo o el formato no es válido.";

const CENTAVOS = 100;
const aCentavos = (pesos: number) => Math.round(pesos * CENTAVOS);

/**
 * `created_at` y `updated_at` los pone la base (default y trigger de fecha);
 * el tipo generado los marca opcionales porque `supabase gen types` no
 * distingue "podés omitirla" de "no la escribas vos". El `Omit` deja la
 * segunda lectura, que es la que vale — misma barrera que llevaba
 * `lib/erp-db.ts` antes de borrarse.
 */
type SupplierInsert = Omit<
  Database["erp"]["Tables"]["suppliers"]["Insert"],
  "created_at" | "updated_at"
>;

/** `institution_id` fuera: un proveedor no se muda de institución. */
type SupplierUpdate = Omit<
  Database["erp"]["Tables"]["suppliers"]["Update"],
  "id" | "institution_id" | "created_at" | "updated_at"
>;

function revalidarCompras(purchaseId?: string) {
  revalidatePath(`${ERP_BASE}/compras`);
  if (purchaseId) revalidatePath(`${ERP_BASE}/compras/${purchaseId}`);
  // Una compra mueve el stock: el tablero y la pantalla de Stock dependen de
  // este mismo dato.
  revalidatePath(`${ERP_BASE}/stock`);
  revalidatePath(ERP_BASE);
}

/**
 * "Sin acceso a Compras" es el mensaje que levanta
 * `erp.register_purchase()` (105) cuando quien llama no es titular ni tiene
 * el permiso `compras` delegado. Se muestra tal cual, mismo criterio que
 * `esStockInsuficiente()` en `stock-actions.ts`: ya está escrito para que lo
 * lea una persona.
 */
function esSinAccesoCompras(mensaje?: string) {
  return Boolean(mensaje?.includes("Sin acceso a Compras"));
}

export async function createSupplier(
  input: SupplierValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      insertInto("erp.suppliers", {
        institution_id: vet.institucionId,
        name: valores.nombre,
        tax_id: valores.cuit || null,
        phone: valores.telefono || null,
        email: valores.email || null,
        active: true,
      } satisfies SupplierInsert),
    ),
  );

  if (error) {
    console.error("createSupplier", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarCompras();
  return { ok: true };
}

/**
 * Desactivar / reactivar un proveedor. No hay `deleteSupplier`: la tabla no
 * tiene política de DELETE (105), un proveedor con compras históricas tiene
 * que poder seguir explicándolas.
 */
export async function setSupplierActive(
  supplierId: string,
  activo: boolean,
): Promise<ActionResult> {
  const vet = await requireErp();

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      sql`${updateSet("erp.suppliers", { active: activo } satisfies SupplierUpdate)}
          where id = ${supplierId} and institution_id = ${vet.institucionId}`,
    ),
  );

  if (error) {
    console.error("setSupplierActive", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarCompras();
  return { ok: true };
}

/**
 * Registrar una compra.
 *
 * Pasa por `erp.register_purchase()` y no por dos o tres INSERTs desde acá:
 * el documento, sus líneas y el movimiento de stock por línea tienen que
 * ocurrir juntos o no ocurrir — mismo argumento que `registerMovement()` con
 * `erp.void_movement()`. La conversión pesos→centavos se hace acá, en el
 * borde, antes de armar el JSON que espera la función.
 */
export async function registerPurchase(
  input: PurchaseValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    rpc(tx, "erp.register_purchase", {
      p_payload: {
        supplier_id: valores.proveedorId,
        note: valores.nota || null,
        items: valores.lineas.map((linea) => ({
          product_id: linea.productoId,
          quantity: linea.cantidad,
          unit_cost_cents: aCentavos(linea.costoUnitario),
        })),
      },
    }),
  );

  if (error) {
    if (esSinAccesoCompras(error.message)) {
      return { ok: false, error: error.message };
    }

    console.error("registerPurchase", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarCompras();
  return { ok: true };
}
