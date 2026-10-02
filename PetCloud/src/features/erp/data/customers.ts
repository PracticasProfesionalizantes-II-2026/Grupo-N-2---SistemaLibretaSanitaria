import "server-only";

import { sql } from "drizzle-orm";

import {
  toAccountMovement,
  toCustomer,
  toCustomerPrefill,
  type AccountMovementCardRow,
  type CustomerCardRow,
} from "@/features/erp/lib/customer-mappers";
import { requireErp } from "@/features/erp/lib/erp-session";
import { nombreProfesional } from "@/features/erp/lib/erp-sql";
import { getDb, query } from "@/lib/db";
import type { AccountMovement, Customer, CustomerPrefill } from "@/types/erp";

/**
 * Lecturas del módulo de Clientes + cuenta corriente (migración 107).
 *
 * `requireErp()` en cada función, mismo criterio que `data/cash.ts`: RLS ya
 * filtra por `erp.has_access(institution_id, 'ventas')`, pero repetir el
 * gate acá corta con una explicación en pantalla en vez de una lista vacía
 * sin decir por qué.
 */

const COLUMNAS_CLIENTE = sql.raw(
  "id, profile_id, razon_social, tipo_documento, numero_documento, condicion_iva, domicilio, email, phone, credit_limit_cents, balance_cents, active",
);

export async function listCustomers(): Promise<Customer[]> {
  const vet = await requireErp();

  const data = await query<CustomerCardRow>(
    getDb(),
    sql`select ${COLUMNAS_CLIENTE} from erp.customers
         where institution_id = ${vet.institucionId} order by razon_social`,
  ).catch((error) => {
    console.error("listCustomers", error);
    return [];
  });

  return data.map(toCustomer);
}

export async function listAccountMovements(
  customerId: string,
  limite = 100,
): Promise<AccountMovement[]> {
  const vet = await requireErp();

  const movimientos = await query<
    AccountMovementCardRow & { responsable: string | null }
  >(
    getDb(),
    sql`select m.id, m.customer_id, m.kind, m.amount_cents, m.note, m.voided_at,
               m.voids_movement_id, m.created_by, m.created_at,
               ${nombreProfesional("m.created_by")} as responsable
          from erp.account_movements m
         where m.customer_id = ${customerId}
           and m.institution_id = ${vet.institucionId}
         order by m.created_at desc limit ${limite}`,
  ).catch((error) => {
    console.error("listAccountMovements", error);
    return [];
  });

  return movimientos.map((movimiento) =>
    toAccountMovement(movimiento, movimiento.responsable ?? "—"),
  );
}

/** Datos del perfil de un dueño para precargar el alta de cliente. */
export async function getCustomerPrefill(
  profileId: string,
): Promise<CustomerPrefill | null> {
  await requireErp();

  const [data] = await query<Parameters<typeof toCustomerPrefill>[0]>(
    getDb(),
    sql`select first_name, last_name, address, phone from profiles
         where id = ${profileId}`,
  ).catch((error) => {
    console.error("getCustomerPrefill", error);
    return [];
  });

  return data ? toCustomerPrefill(data) : null;
}
