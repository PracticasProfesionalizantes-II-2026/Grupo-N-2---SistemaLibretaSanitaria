"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ERP_BASE } from "@/config/erp-nav";
import type { ActionResult } from "@/features/erp/actions/stock-actions";
import { requireErp } from "@/features/erp/lib/erp-session";
import {
  accountAdjustmentSchema,
  accountPaymentSchema,
  customerSchema,
  updateCustomerSchema,
  voidAccountMovementSchema,
  type AccountAdjustmentValues,
  type AccountPaymentValues,
  type CustomerValues,
  type UpdateCustomerValues,
  type VoidAccountMovementValues,
} from "@/features/erp/schemas/customer-schemas";
import { erpWrite } from "@/features/erp/lib/erp-sql";
import { insertInto, rpc, updateSet } from "@/lib/db";
import type { Database } from "@/types/database";

/**
 * Escrituras del módulo de Clientes + cuenta corriente (migración 107).
 *
 * Mismo criterio que `cash-actions.ts`: `requireErp()` primero, para que
 * quien llegue sin sesión Premium reciba un mensaje de PetCloud y no un
 * formulario entero que termina en un error crudo de PostgreSQL.
 */

const ERROR_GENERICO = "No pudimos guardar el cambio. Probá de nuevo.";
const DATOS_INVALIDOS =
  "Revisá los datos: falta algo o el formato no es válido.";

const CENTAVOS = 100;
const aCentavos = (pesos: number) => Math.round(pesos * CENTAVOS);

/**
 * `balance_cents` lo escribe el trigger `erp_account_movements_apply` (107)
 * sumando los movimientos de cuenta, igual que `stock` sale del libro de
 * movimientos (101). El tipo generado lo marca opcional —el generador de tipos
 * no distingue "tiene default" de "no la escribas vos"—, así que el `Omit`
 * restituye la garantía: fijar un saldo a mano vuelve a ser un error de
 * compilación. Es la misma barrera que llevaba `lib/erp-db.ts` antes de
 * borrarse.
 */
type CustomerInsert = Omit<
  Database["erp"]["Tables"]["customers"]["Insert"],
  "balance_cents" | "created_at" | "updated_at"
>;

/** Además del saldo, `institution_id` fuera: un cliente no cambia de dueño. */
type CustomerUpdate = Omit<
  Database["erp"]["Tables"]["customers"]["Update"],
  "id" | "institution_id" | "balance_cents" | "created_at" | "updated_at"
>;

/**
 * La anulación de un movimiento de cuenta la hace
 * `erp.void_account_movement()` (107), que marca el original y crea el
 * contrasiento en la misma transacción: `voided_at`, `voided_by` y
 * `voids_movement_id` quedan fuera del INSERT para que ese sea el único
 * camino. `sale_id` también: un movimiento con venta asociada lo escribe
 * `erp.register_sale()` (108), no este formulario de ajuste manual.
 */
type AccountMovementInsert = Omit<
  Database["erp"]["Tables"]["account_movements"]["Insert"],
  "sale_id" | "voided_at" | "voided_by" | "voids_movement_id" | "created_at"
>;

function revalidarClientes() {
  revalidatePath(`${ERP_BASE}/clientes`);
  revalidatePath(ERP_BASE);
}

/**
 * "Sin acceso a Clientes" es el mensaje que levantan
 * `erp.register_account_payment()` y `erp.void_account_movement()` (107)
 * cuando quien llama no es titular ni tiene el permiso `ventas` delegado
 * (que, por decisión 5, en la práctica es todo el mundo Premium — el mensaje
 * queda igual por si algún día deja de serlo).
 */
function esSinAccesoClientes(mensaje?: string) {
  return Boolean(mensaje?.includes("Sin acceso a Clientes"));
}

function normalizarOpcional(valor?: string) {
  return valor && valor.trim().length > 0 ? valor.trim() : null;
}

export async function createCustomer(
  input: CustomerValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      insertInto("erp.customers", {
        institution_id: vet.institucionId,
        profile_id: normalizarOpcional(valores.profileId),
        razon_social: valores.razonSocial,
        tipo_documento: valores.tipoDocumento,
        numero_documento: normalizarOpcional(valores.numeroDocumento),
        condicion_iva: valores.condicionIva,
        domicilio: normalizarOpcional(valores.domicilio),
        email: normalizarOpcional(valores.email),
        phone: normalizarOpcional(valores.phone),
        credit_limit_cents:
          valores.limiteCredito != null
            ? aCentavos(valores.limiteCredito)
            : null,
      } satisfies CustomerInsert),
    ),
  );

  if (error) {
    console.error("createCustomer", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarClientes();
  return { ok: true };
}

export async function updateCustomer(
  input: UpdateCustomerValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      sql`${updateSet("erp.customers", {
        profile_id: normalizarOpcional(valores.profileId),
        razon_social: valores.razonSocial,
        tipo_documento: valores.tipoDocumento,
        numero_documento: normalizarOpcional(valores.numeroDocumento),
        condicion_iva: valores.condicionIva,
        domicilio: normalizarOpcional(valores.domicilio),
        email: normalizarOpcional(valores.email),
        phone: normalizarOpcional(valores.phone),
        credit_limit_cents:
          valores.limiteCredito != null
            ? aCentavos(valores.limiteCredito)
            : null,
        ...(valores.active !== undefined ? { active: valores.active } : {}),
      } satisfies CustomerUpdate)}
          where id = ${valores.id} and institution_id = ${vet.institucionId}`,
    ),
  );

  if (error) {
    console.error("updateCustomer", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarClientes();
  return { ok: true };
}

/**
 * Ajuste manual de cuenta corriente — saldo inicial o corrección. Es un
 * INSERT directo, no una RPC: la fila del cliente ya existe (a diferencia
 * del cajón, que se crea perezosamente), así que no hace falta
 * `SECURITY DEFINER`. El trigger `erp_account_movements_apply` (107) aplica
 * el saldo, sin bloquear negativo.
 */
export async function registerAccountAdjustment(
  input: AccountAdjustmentValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = accountAdjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  // "Debe" suma deuda del cliente (positivo), "haber" la reduce (negativo) —
  // mismo criterio que el formulario de ajuste de stock: la persona elige el
  // sentido, no escribe un número negativo a mano.
  const montoCents = aCentavos(valores.monto);
  const amountCents = valores.sentido === "debe" ? montoCents : -montoCents;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      insertInto("erp.account_movements", {
        institution_id: vet.institucionId,
        customer_id: valores.customerId,
        kind: "ajuste",
        amount_cents: amountCents,
        note: valores.nota || null,
        created_by: vet.profesionalId,
      } satisfies AccountMovementInsert),
    ),
  );

  if (error) {
    console.error("registerAccountAdjustment", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarClientes();
  return { ok: true };
}

export async function registerAccountPayment(
  input: AccountPaymentValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = accountPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    rpc(tx, "erp.register_account_payment", {
      p_payload: {
        customer_id: valores.customerId,
        amount_cents: aCentavos(valores.monto),
        note: valores.nota || null,
      },
    }),
  );

  if (error) {
    if (esSinAccesoClientes(error.message)) {
      return { ok: false, error: error.message };
    }

    console.error("registerAccountPayment", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarClientes();
  return { ok: true };
}

export async function voidAccountMovement(
  input: VoidAccountMovementValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = voidAccountMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    rpc(tx, "erp.void_account_movement", {
      p_movement_id: valores.movimientoId,
      p_reason: valores.motivo || null,
    }),
  );

  if (error) {
    if (esSinAccesoClientes(error.message)) {
      return { ok: false, error: error.message };
    }

    console.error("voidAccountMovement", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarClientes();
  return { ok: true };
}
