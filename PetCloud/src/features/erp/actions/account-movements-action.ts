"use server";

import "server-only";

import { listAccountMovements } from "@/features/erp/data/customers";
import type { AccountMovement } from "@/types/erp";

/**
 * Envoltorio de Server Action sobre `listAccountMovements()`
 * (`data/customers.ts`), para que `CustomersView` (componente de cliente)
 * pueda pedir el estado de cuenta al expandir un cliente, sin traer los
 * movimientos de todos los clientes por adelantado.
 */
export async function listAccountMovementsAction(
  customerId: string,
): Promise<AccountMovement[]> {
  return listAccountMovements(customerId);
}
