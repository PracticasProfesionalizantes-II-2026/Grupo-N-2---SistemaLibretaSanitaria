import type { CashAccount, CashMovement, CashMovementKind } from "@/types/erp";
import type { Database } from "@/types/supabase";

/**
 * De fila de base a modelo de vista, módulo de Caja (migración 106).
 *
 * Vive en `lib/` y no en `data/`, mismo criterio que `purchase-mappers.ts`:
 * no toca la base, así que un test puede importarlo sin levantar
 * `server-only`.
 *
 * `kind` llega como `string`: el CHECK de `erp.cash_movements.kind` (106, más
 * `cobro_cta_cte` en la 107) restringe los valores en la base, pero un CHECK
 * no es un tipo enumerado y `supabase gen types` no tiene de dónde sacar la
 * unión. Vive en `types/erp.ts` y se estrecha acá — mismo criterio que
 * `stock-mappers.ts` con `unit`.
 */

const CENTAVOS = 100;

type CashAccountRow = Database["erp"]["Tables"]["cash_accounts"]["Row"];
type CashMovementRow = Database["erp"]["Tables"]["cash_movements"]["Row"];

export function toCashAccount(
  fila: Pick<CashAccountRow, "id" | "balance_cents">,
): CashAccount {
  return {
    id: fila.id,
    saldoPesos: fila.balance_cents / CENTAVOS,
  };
}

export type CashMovementCardRow = Pick<
  CashMovementRow,
  | "id"
  | "kind"
  | "amount_cents"
  | "quantity"
  | "note"
  | "voided_at"
  | "voids_movement_id"
  | "created_by"
  | "created_at"
>;

export function toCashMovement(
  fila: CashMovementCardRow,
  responsable: string,
): CashMovement {
  return {
    id: fila.id,
    tipo: fila.kind as CashMovementKind,
    montoPesos: fila.amount_cents / CENTAVOS,
    // `quantity` guarda contado−sistema únicamente para `kind = 'arqueo'`
    // (comentario de `erp.cash_movements`, 106); es la misma cifra que
    // `amount_cents` para ese tipo, expresada como diferencia.
    diferenciaPesos:
      fila.kind === "arqueo" && fila.quantity !== null
        ? Number(fila.quantity) / CENTAVOS
        : null,
    nota: fila.note,
    anulado: fila.voided_at !== null,
    esContrasiento: fila.voids_movement_id !== null,
    responsable,
    fecha: fila.created_at,
  };
}
