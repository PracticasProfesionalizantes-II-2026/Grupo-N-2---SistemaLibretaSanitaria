import type {
  PaymentMethod,
  PaymentMethodCode,
  Sale,
  SaleItem,
  SaleStatus,
} from "@/types/erp";
import type { Database } from "@/types/database";

/**
 * De fila de base a modelo de vista, módulo de Ventas (migración 108).
 *
 * Vive en `lib/` y no en `data/`, mismo criterio que `purchase-mappers.ts`:
 * no toca la base, así que un test puede importarlo sin levantar
 * `server-only`.
 *
 * `payment_method`, `status` y `code` llegan como `string`: los CHECK de la
 * 108 los restringen en la base, pero un CHECK no es un tipo enumerado y
 * el generador de tipos no tiene de dónde sacar la unión. Las uniones viven en
 * `types/erp.ts` y el estrechamiento se hace acá, en el borde — mismo
 * criterio que `stock-mappers.ts` con `unit`.
 */

const CENTAVOS = 100;

/** Se exporta porque es la entrada de `toPaymentMethod`, igual que los `*CardRow`. */
export type PaymentMethodRow =
  Database["erp"]["Tables"]["payment_methods"]["Row"];

type SaleRow = Database["erp"]["Tables"]["sales"]["Row"];
type SaleItemRow = Database["erp"]["Tables"]["sale_items"]["Row"];

export function toPaymentMethod(fila: PaymentMethodRow): PaymentMethod {
  return {
    code: fila.code as PaymentMethodCode,
    label: fila.label,
    postsCash: fila.posts_cash,
    postsAccount: fila.posts_account,
    requiresCustomer: fila.requires_customer,
    activo: fila.active,
  };
}

export type SaleCardRow = Pick<
  SaleRow,
  | "id"
  | "customer_id"
  | "payment_method"
  | "status"
  | "total_cents"
  | "created_by"
  | "created_at"
>;

export function toSale(
  fila: SaleCardRow,
  clienteNombre: string | null,
  responsable: string,
): Sale {
  return {
    id: fila.id,
    clienteId: fila.customer_id,
    clienteNombre,
    metodoPago: fila.payment_method as PaymentMethodCode,
    status: fila.status as SaleStatus,
    totalPesos: fila.total_cents / CENTAVOS,
    responsable,
    fecha: fila.created_at,
  };
}

export type SaleItemCardRow = Pick<
  SaleItemRow,
  "id" | "product_id" | "quantity" | "unit_price_cents"
>;

/**
 * `Number(...)` sobre `quantity` no es decorativo: PostgREST serializa
 * `NUMERIC` como string para no perder precisión en el JSON (mismo motivo que
 * `purchase-mappers.ts:totalDeLineas`).
 */
export function toSaleItem(
  fila: SaleItemCardRow,
  productoNombre: string,
): SaleItem {
  return {
    id: fila.id,
    productoId: fila.product_id,
    productoNombre,
    cantidad: Number(fila.quantity),
    precioUnitario: fila.unit_price_cents / CENTAVOS,
  };
}

/**
 * Total de una lista de líneas, en pesos — para que el formulario muestre el
 * total mientras se cargan las líneas, antes de mandar la venta. Pura, para
 * poder usarla desde un `useWatch` sin tocar la base.
 */
export function calcularTotalPesos(
  lineas: { cantidad: number; precioUnitario: number }[],
): number {
  return lineas.reduce(
    (acumulado, linea) => acumulado + linea.cantidad * linea.precioUnitario,
    0,
  );
}
