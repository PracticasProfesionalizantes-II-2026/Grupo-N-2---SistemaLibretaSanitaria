"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { ERP_BASE } from "@/config/erp-nav";
import type { ActionResult } from "@/features/erp/actions/stock-actions";
import { requireErp } from "@/features/erp/lib/erp-session";
import {
  saleSchema,
  voidSaleSchema,
  type SaleValues,
  type VoidSaleValues,
} from "@/features/erp/schemas/sale-schemas";
import { erpWrite } from "@/features/erp/lib/erp-sql";
import { rpc } from "@/lib/db";

/**
 * Escrituras del módulo de Ventas (migración 108).
 *
 * Mismo criterio que `purchase-actions.ts`: `requireErp()` primero, no por
 * redundancia con RLS sino porque devuelve un mensaje de PetCloud en vez del
 * error crudo de PostgreSQL.
 */

const ERROR_GENERICO = "No pudimos guardar el cambio. Probá de nuevo.";
const DATOS_INVALIDOS =
  "Revisá los datos: falta algo o el formato no es válido.";

const CENTAVOS = 100;
const aCentavos = (pesos: number) => Math.round(pesos * CENTAVOS);

function revalidarVentas(saleId?: string) {
  revalidatePath(`${ERP_BASE}/ventas`);
  if (saleId) revalidatePath(`${ERP_BASE}/ventas/${saleId}`);
  // Una venta mueve el stock y postea a caja o a cuenta corriente: las tres
  // pantallas dependen de este mismo dato.
  revalidatePath(`${ERP_BASE}/stock`);
  revalidatePath(`${ERP_BASE}/caja`);
  revalidatePath(`${ERP_BASE}/clientes`);
  revalidatePath(ERP_BASE);
}

/**
 * "Sin acceso a Ventas" es el mensaje que levanta `erp.register_sale()`
 * (108) cuando quien llama no es titular ni tiene el permiso `ventas`
 * delegado — que, por decisión 5, en la práctica es todo el mundo Premium.
 */
function esSinAccesoVentas(mensaje?: string) {
  return Boolean(mensaje?.includes("Sin acceso a Ventas"));
}

/**
 * `ERP01` es el SQLSTATE que levanta `erp.check_stock_suficiente()` (102)
 * cuando una línea dejaría el stock por debajo de cero. Se compara también
 * contra el texto porque PostgREST no siempre propaga un SQLSTATE de clase
 * propia en `code` — mismo criterio que `esStockInsuficiente()` en
 * `stock-actions.ts:74-76`.
 */
function esStockInsuficiente(codigo?: string, mensaje?: string) {
  return codigo === "ERP01" || Boolean(mensaje?.includes("Stock insuficiente"));
}

/**
 * `ERP03` es el SQLSTATE que levanta `erp.enforce_account_movement_routing()`
 * (108) cuando una venta en cuenta corriente no trae un cliente identificado.
 * Mismo criterio de comparación doble que `esStockInsuficiente()`, arriba —
 * ver `stock-actions.ts:236-243` para el precedente que este código copia.
 */
function esCuentaCorrienteSinCliente(codigo?: string, mensaje?: string) {
  return (
    codigo === "ERP03" ||
    Boolean(mensaje?.includes("necesita un cliente identificado"))
  );
}

/**
 * Registrar una venta.
 *
 * Pasa por `erp.register_sale()` y no por N INSERTs desde acá: el
 * documento, sus líneas, el movimiento de stock por línea y el movimiento de
 * cobro tienen que ocurrir juntos o no ocurrir — mismo argumento que
 * `registerPurchase()` con `erp.register_purchase()`. La conversión
 * pesos→centavos se hace acá, en el borde, antes de armar el JSON que espera
 * la función.
 */
export async function registerSale(input: SaleValues): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    rpc(tx, "erp.register_sale", {
      p_payload: {
        customer_id: valores.clienteId || null,
        payment_method: valores.metodoPago,
        items: valores.lineas.map((linea) => ({
          product_id: linea.productoId,
          quantity: linea.cantidad,
          unit_price_cents: aCentavos(linea.precioUnitario),
        })),
      },
    }),
  );

  if (error) {
    if (esStockInsuficiente(error.code, error.message)) {
      return { ok: false, error: error.message, campo: "lineas" };
    }

    if (esCuentaCorrienteSinCliente(error.code, error.message)) {
      return { ok: false, error: error.message, campo: "clienteId" };
    }

    if (esSinAccesoVentas(error.message)) {
      return { ok: false, error: error.message };
    }

    console.error("registerSale", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarVentas();
  return { ok: true };
}

/**
 * Anular una venta.
 *
 * Pasa por `erp.void_sale()` (109) y no por escrituras sueltas desde acá:
 * el contrasiento de stock, y el de caja o cuenta corriente según el método
 * de pago, tienen que quedar todos escritos o ninguno — mismo argumento que
 * `registerSale()` con `erp.register_sale()`, y que `voidMovement()`
 * (`stock-actions.ts`) con `erp.void_movement()`.
 *
 * Los mensajes de error salen de los `RAISE EXCEPTION` de la función: ya
 * están escritos para que los lea una persona ("Esa venta ya estaba
 * anulada", "La venta no existe"), así que se muestran tal cual — mismo
 * criterio que `voidMovement()`.
 */
export async function voidSale(input: VoidSaleValues): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = voidSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const error = await erpWrite(vet.usuario.id, (tx) =>
    rpc(tx, "erp.void_sale", {
      p_sale_id: parsed.data.ventaId,
      p_reason: parsed.data.motivo,
    }),
  );

  if (error) {
    console.error("voidSale", error);
    return { ok: false, error: error.message || ERROR_GENERICO };
  }

  revalidarVentas(parsed.data.ventaId);
  return { ok: true };
}
