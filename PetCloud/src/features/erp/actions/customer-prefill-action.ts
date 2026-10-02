"use server";

import "server-only";

import { getCustomerPrefill } from "@/features/erp/data/customers";
import type { CustomerPrefill } from "@/types/erp";

/**
 * Envoltorio de Server Action sobre `getCustomerPrefill()` (`data/customers.ts`).
 *
 * Vive separado de `customer-actions.ts` porque es una lectura, no una
 * escritura — mismo criterio que separa `data/` de `actions/` en el resto del
 * ERP, solo que acá la lectura la necesita un componente de cliente
 * (`CustomerModal`), que no puede importar `data/` directo (`server-only` lo
 * impediría en build). Una Server Action es la puerta angosta para ese caso.
 */
export async function getCustomerPrefillAction(
  profileId: string,
): Promise<CustomerPrefill | null> {
  return getCustomerPrefill(profileId);
}
