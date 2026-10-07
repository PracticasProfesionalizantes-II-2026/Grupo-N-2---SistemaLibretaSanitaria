"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { ERP_BASE } from "@/config/erp-nav";
import type { ActionResult } from "@/features/erp/actions/stock-actions";
import { requireErp } from "@/features/erp/lib/erp-session";
import {
  arqueoSchema,
  cashMovementSchema,
  voidCashMovementSchema,
  type ArqueoValues,
  type CashMovementValues,
  type VoidCashMovementValues,
} from "@/features/erp/schemas/cash-schemas";
import { erpWrite } from "@/features/erp/lib/erp-sql";
import { rpc } from "@/lib/db";

/**
 * Escrituras del módulo de Caja (migración 106).
 *
 * Mismo criterio que `purchase-actions.ts`: `requireErp()` primero, para que
 * quien llegue sin sesión Premium reciba un mensaje de PetCloud y no un
 * formulario entero que termina en un error crudo de PostgreSQL.
 */

const ERROR_GENERICO = "No pudimos guardar el cambio. Probá de nuevo.";
const DATOS_INVALIDOS =
  "Revisá los datos: falta algo o el formato no es válido.";

const CENTAVOS = 100;
const aCentavos = (pesos: number) => Math.round(pesos * CENTAVOS);

function revalidarCaja() {
  revalidatePath(`${ERP_BASE}/caja`);
  revalidatePath(ERP_BASE);
}

/**
 * "Sin acceso a Caja" es el mensaje que levantan `erp.record_cash_movement()`,
 * `erp.record_arqueo()` y `erp.void_cash_movement()` (106) cuando quien llama
 * no es titular ni tiene el permiso `caja` delegado. Se muestra tal cual,
 * mismo criterio que `esSinAccesoCompras()` en `purchase-actions.ts`.
 */
function esSinAccesoCaja(mensaje?: string) {
  return Boolean(mensaje?.includes("Sin acceso a Caja"));
}

/**
 * `ERP02` es el SQLSTATE que levanta `erp.apply_cash_movement()` (106)
 * cuando un movimiento dejaría el cajón en negativo. Mismo criterio que
 * `esStockInsuficiente()` en `stock-actions.ts`: se compara código y texto
 * porque PostgREST no siempre propaga un SQLSTATE de clase propia.
 */
function esCajaNegativa(codigo?: string, mensaje?: string) {
  return (
    codigo === "ERP02" || Boolean(mensaje?.includes("quedaría en negativo"))
  );
}

export async function recordCashMovement(
  input: CashMovementValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = cashMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  // Caja chica y pago a proveedor salen del cajón (monto negativo); un
  // retiro también sale. Ninguno de los tres carga en este slice porque no
  // hay un tipo que entre desde acá aparte del ajuste de arqueo.
  //
  // `p_note` va omitido y no en `null`: en la base es `TEXT DEFAULT NULL`
  // (106) y el tipo generado lo escribe `p_note?: string`, porque
  // el generador de tipos no conserva la nulabilidad de un argumento con
  // default. Omitirlo deja el mismo NULL que mandaba el `null` explícito —
  // es lo que ya hacía `voidCashMovement()` acá abajo con `p_reason`.
  const error = await erpWrite(vet.usuario.id, (tx) =>
    rpc(tx, "erp.record_cash_movement", {
      p_kind: valores.tipo,
      p_amount_cents: -aCentavos(valores.monto),
      p_note: valores.nota || null,
    }),
  );

  if (error) {
    if (esSinAccesoCaja(error.message)) {
      return { ok: false, error: error.message };
    }
    if (esCajaNegativa(error.code, error.message)) {
      return { ok: false, error: error.message, campo: "monto" };
    }

    console.error("recordCashMovement", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarCaja();
  return { ok: true };
}

export async function recordArqueo(input: ArqueoValues): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = arqueoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    rpc(tx, "erp.record_arqueo", {
      p_counted_cents: aCentavos(valores.contado),
      // Mismo caso que `p_note` en `recordCashMovement()`: `TEXT DEFAULT NULL`
      // en la base, `p_reason?: string` en el tipo generado.
      p_reason: valores.motivo || null,
    }),
  );

  if (error) {
    if (esSinAccesoCaja(error.message)) {
      return { ok: false, error: error.message };
    }

    console.error("recordArqueo", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarCaja();
  return { ok: true };
}

export async function voidCashMovement(
  input: VoidCashMovementValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = voidCashMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    rpc(tx, "erp.void_cash_movement", {
      p_movement_id: valores.movimientoId,
      p_reason: valores.motivo || null,
    }),
  );

  if (error) {
    if (esSinAccesoCaja(error.message)) {
      return { ok: false, error: error.message };
    }

    console.error("voidCashMovement", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarCaja();
  return { ok: true };
}
