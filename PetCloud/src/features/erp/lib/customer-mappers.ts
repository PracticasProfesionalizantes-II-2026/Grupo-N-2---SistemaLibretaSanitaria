import type {
  AccountMovement,
  AccountMovementKind,
  Customer,
  CustomerDocumentType,
  CustomerPrefill,
  CustomerTaxCondition,
} from "@/types/erp";
import type { Database } from "@/types/database";

/**
 * De fila de base a modelo de vista, módulo de Clientes (migración 107).
 *
 * Vive en `lib/` y no en `data/`, mismo criterio que `cash-mappers.ts`: no
 * toca la base, así que un test puede importarlo sin levantar `server-only`.
 *
 * `tipo_documento`, `condicion_iva` y `kind` llegan como `string`: los CHECK
 * de la 107 los restringen en la base, pero un CHECK no es un tipo enumerado
 * y el generador de tipos no tiene de dónde sacar la unión. Viven en
 * `types/erp.ts` y se estrechan acá — mismo criterio que `stock-mappers.ts`
 * con `unit`.
 */

const CENTAVOS = 100;

type CustomerRow = Database["erp"]["Tables"]["customers"]["Row"];
type AccountMovementRow = Database["erp"]["Tables"]["account_movements"]["Row"];

export type CustomerCardRow = Pick<
  CustomerRow,
  | "id"
  | "profile_id"
  | "razon_social"
  | "tipo_documento"
  | "numero_documento"
  | "condicion_iva"
  | "domicilio"
  | "email"
  | "phone"
  | "credit_limit_cents"
  | "balance_cents"
  | "active"
>;

/**
 * `sobreLimite` es la bandera de la lista de clientes (decisión 5 —
 * `erp-customer-accounts` spec, "flag the customer in the customer list").
 * `NULL` en el límite nunca marca — un cliente sin límite configurado no
 * puede "superarlo".
 */
export function estaSobreLimite(
  saldoCents: number,
  limiteCents: number | null,
): boolean {
  if (limiteCents === null) return false;
  return saldoCents > limiteCents;
}

export function toCustomer(fila: CustomerCardRow): Customer {
  return {
    id: fila.id,
    profileId: fila.profile_id,
    razonSocial: fila.razon_social,
    tipoDocumento: fila.tipo_documento as CustomerDocumentType,
    numeroDocumento: fila.numero_documento,
    condicionIva: fila.condicion_iva as CustomerTaxCondition,
    domicilio: fila.domicilio,
    email: fila.email,
    phone: fila.phone,
    limiteCreditoPesos:
      fila.credit_limit_cents === null
        ? null
        : fila.credit_limit_cents / CENTAVOS,
    saldoPesos: fila.balance_cents / CENTAVOS,
    activo: fila.active,
    sobreLimite: estaSobreLimite(fila.balance_cents, fila.credit_limit_cents),
  };
}

export type AccountMovementCardRow = Pick<
  AccountMovementRow,
  | "id"
  | "customer_id"
  | "kind"
  | "amount_cents"
  | "note"
  | "voided_at"
  | "voids_movement_id"
  | "created_by"
  | "created_at"
>;

export function toAccountMovement(
  fila: AccountMovementCardRow,
  responsable: string,
): AccountMovement {
  return {
    id: fila.id,
    customerId: fila.customer_id,
    tipo: fila.kind as AccountMovementKind,
    montoPesos: fila.amount_cents / CENTAVOS,
    nota: fila.note,
    anulado: fila.voided_at !== null,
    esContrasiento: fila.voids_movement_id !== null,
    responsable,
    fecha: fila.created_at,
  };
}

/**
 * Prefill de `public.profiles` — nunca escribe ahí, solo lee lo que la
 * política `profiles_select_by_vet` (012) ya deja ver. `first_name` +
 * `last_name` armados acá porque la pantalla solo necesita un nombre, no
 * las dos partes.
 */
export function toCustomerPrefill(perfil: {
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  phone: string | null;
}): CustomerPrefill {
  const nombre = [perfil.first_name, perfil.last_name]
    .filter(Boolean)
    .join(" ");

  return {
    nombre: nombre || null,
    domicilio: perfil.address,
    telefono: perfil.phone,
  };
}
