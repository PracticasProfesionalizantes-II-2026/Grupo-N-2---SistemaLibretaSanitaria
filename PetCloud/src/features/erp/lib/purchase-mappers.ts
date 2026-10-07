import type { Purchase, Supplier } from "@/types/erp";
import type { Database } from "@/types/database";

/**
 * De fila de base a modelo de vista, módulo de Compras (migración 105).
 *
 * Vive en `lib/` y no en `data/` por la misma regla que `stock-mappers.ts`:
 * no toca la base, así que un test puede importarlo sin levantar
 * `server-only`.
 */

const CENTAVOS = 100;

type SupplierRow = Database["erp"]["Tables"]["suppliers"]["Row"];
type PurchaseRow = Database["erp"]["Tables"]["purchases"]["Row"];
type PurchaseItemRow = Database["erp"]["Tables"]["purchase_items"]["Row"];

export type SupplierCardRow = Pick<
  SupplierRow,
  "id" | "name" | "tax_id" | "phone" | "email" | "active"
>;

export function toSupplier(fila: SupplierCardRow): Supplier {
  return {
    id: fila.id,
    nombre: fila.name,
    cuit: fila.tax_id,
    telefono: fila.phone,
    email: fila.email,
    activo: fila.active,
  };
}

export type PurchaseCardRow = Pick<
  PurchaseRow,
  "id" | "supplier_id" | "note" | "created_by" | "created_at"
>;

export type PurchaseItemCardRow = Pick<
  PurchaseItemRow,
  "id" | "purchase_id" | "product_id" | "quantity" | "unit_cost_cents"
>;

/**
 * El total de una compra no lo guarda ninguna columna: se calcula sumando sus
 * líneas, igual que el stock se calcula sumando el libro de movimientos
 * (101). Guardar un `total_cents` en `purchases` sería la misma trampa de
 * "número que se edita en vez de sumarse" que la 101 explica al pie de la
 * letra — con la diferencia de que acá el libro de líneas ni siquiera admite
 * anulación parcial, así que la suma nunca se puede desviar de sus partes.
 *
 * `Number(...)` sobre `quantity` no es decorativo: PostgREST serializa
 * `NUMERIC` como string para no perder precisión en el JSON (mismo motivo que
 * `stock-mappers.ts:toProduct`).
 */
export function totalDeLineas(lineas: PurchaseItemCardRow[]): number {
  const centavos = lineas.reduce(
    (acumulado, linea) =>
      acumulado + Number(linea.quantity) * linea.unit_cost_cents,
    0,
  );

  return centavos / CENTAVOS;
}

export function toPurchase(
  fila: PurchaseCardRow,
  lineas: PurchaseItemCardRow[],
  proveedorNombre: string,
  responsable: string,
): Purchase {
  return {
    id: fila.id,
    proveedorId: fila.supplier_id,
    proveedorNombre,
    nota: fila.note,
    totalPesos: totalDeLineas(lineas),
    responsable,
    fecha: fila.created_at,
  };
}
