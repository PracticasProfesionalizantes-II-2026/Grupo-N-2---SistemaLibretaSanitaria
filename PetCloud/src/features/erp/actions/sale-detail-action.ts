"use server";

import "server-only";

import { getSale } from "@/features/erp/data/sales";
import type { SaleDetail } from "@/types/erp";

/**
 * Envoltorio de Server Action sobre `getSale()` (`data/sales.ts`), para que
 * `SalesView` (componente de cliente) pueda pedir las líneas de una venta al
 * expandirla, sin traer las líneas de las cien últimas ventas por
 * adelantado — mismo criterio que `listAccountMovementsAction`.
 */
export async function getSaleAction(
  saleId: string,
): Promise<SaleDetail | null> {
  return getSale(saleId);
}
