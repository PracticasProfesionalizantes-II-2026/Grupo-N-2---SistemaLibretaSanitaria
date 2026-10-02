import "server-only";

import { sql } from "drizzle-orm";

import { requireErp } from "@/features/erp/lib/erp-session";
import { nombreProfesional } from "@/features/erp/lib/erp-sql";
import {
  toPaymentMethod,
  toSale,
  toSaleItem,
  type SaleCardRow,
  type SaleItemCardRow,
} from "@/features/erp/lib/sale-mappers";
import { getDb, query } from "@/lib/db";
import type { PaymentMethod, Sale, SaleDetail } from "@/types/erp";

/** Lecturas de ventas del ERP, acotadas a la institución del veterinario. */

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  await requireErp();

  const data = await query<Parameters<typeof toPaymentMethod>[0]>(
    getDb(),
    sql`select code, label, posts_cash, posts_account, requires_customer, active
          from erp.payment_methods where active`,
  ).catch((error) => {
    console.error("listPaymentMethods", error);
    return [];
  });

  return data.map(toPaymentMethod);
}

type FilaVenta = SaleCardRow & {
  cliente: string | null;
  responsable: string | null;
};

const SELECT_VENTA = sql`select s.id, s.customer_id, s.payment_method, s.status,
    s.total_cents, s.created_by, s.created_at,
    c.razon_social as cliente,
    ${nombreProfesional("s.created_by")} as responsable
  from erp.sales s
  left join erp.customers c on c.id = s.customer_id`;

const aVenta = (venta: FilaVenta) =>
  toSale(
    venta,
    venta.customer_id ? (venta.cliente ?? "—") : null,
    venta.responsable ?? "—",
  );

export async function listSales(limite = 100): Promise<Sale[]> {
  const vet = await requireErp();

  const ventas = await query<FilaVenta>(
    getDb(),
    sql`${SELECT_VENTA}
        where s.institution_id = ${vet.institucionId}
        order by s.created_at desc limit ${limite}`,
  ).catch((error) => {
    console.error("listSales", error);
    return [];
  });

  return ventas.map(aVenta);
}

export async function getSale(saleId: string): Promise<SaleDetail | null> {
  const vet = await requireErp();
  const db = getDb();

  const [venta] = await query<FilaVenta>(
    db,
    sql`${SELECT_VENTA}
        where s.id = ${saleId} and s.institution_id = ${vet.institucionId}`,
  );
  if (!venta) return null;

  const lineas = await query<SaleItemCardRow & { producto: string | null }>(
    db,
    sql`select i.id, i.product_id, i.quantity, i.unit_price_cents,
               p.name as producto
          from erp.sale_items i
          left join erp.products p on p.id = i.product_id
         where i.sale_id = ${saleId}`,
  );

  return {
    ...aVenta(venta),
    lineas: lineas.map((linea) => toSaleItem(linea, linea.producto ?? "—")),
  };
}
