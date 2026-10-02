import "server-only";

import { sql } from "drizzle-orm";

import {
  toCashAccount,
  toCashMovement,
  type CashMovementCardRow,
} from "@/features/erp/lib/cash-mappers";
import { requireErp } from "@/features/erp/lib/erp-session";
import { nombreProfesional } from "@/features/erp/lib/erp-sql";
import { getDb, query } from "@/lib/db";
import type { CashAccount, CashMovement } from "@/types/erp";

/** La caja de la institución (una sola por institución). */
export async function getCashAccount(): Promise<CashAccount | null> {
  const vet = await requireErp();

  const [data] = await query<{ id: string; balance_cents: number }>(
    getDb(),
    sql`select id, balance_cents from erp.cash_accounts
         where institution_id = ${vet.institucionId} limit 1`,
  ).catch((error) => {
    console.error("getCashAccount", error);
    return [];
  });

  return data ? toCashAccount(data) : null;
}

export async function listCashMovements(limite = 100): Promise<CashMovement[]> {
  const vet = await requireErp();

  const movimientos = await query<
    CashMovementCardRow & { responsable: string | null }
  >(
    getDb(),
    sql`select m.id, m.kind, m.amount_cents, m.quantity, m.note, m.voided_at,
               m.voids_movement_id, m.created_by, m.created_at,
               ${nombreProfesional("m.created_by")} as responsable
          from erp.cash_movements m
         where m.institution_id = ${vet.institucionId}
         order by m.created_at desc limit ${limite}`,
  ).catch((error) => {
    console.error("listCashMovements", error);
    return [];
  });

  return movimientos.map((movimiento) =>
    toCashMovement(movimiento, movimiento.responsable ?? "—"),
  );
}
