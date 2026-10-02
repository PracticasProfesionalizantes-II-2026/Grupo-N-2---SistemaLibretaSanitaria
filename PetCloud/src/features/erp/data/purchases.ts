import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { requireErp } from "@/features/erp/lib/erp-session";
import { nombreProfesional } from "@/features/erp/lib/erp-sql";
import {
  toPurchase,
  toSupplier,
  type PurchaseCardRow,
  type PurchaseItemCardRow,
} from "@/features/erp/lib/purchase-mappers";
import { getDb, query } from "@/lib/db";
import type { Purchase, Supplier } from "@/types/erp";

/** Lecturas de compras y proveedores, acotadas a la institución. */

export async function listSuppliers(): Promise<Supplier[]> {
  const vet = await requireErp();

  const data = await query<Parameters<typeof toSupplier>[0]>(
    getDb(),
    sql`select id, name, tax_id, phone, email, active from erp.suppliers
         where institution_id = ${vet.institucionId} order by name`,
  ).catch((error) => {
    console.error("listSuppliers", error);
    return [];
  });

  return data.map(toSupplier);
}

type FilaCompra = PurchaseCardRow & {
  proveedor: string | null;
  responsable: string | null;
};

type FilaLinea = PurchaseItemCardRow & { producto: string | null };

async function compras(where: SQL, limite = 100) {
  const db = getDb();
  const filas = await query<FilaCompra>(
    db,
    sql`select c.id, c.supplier_id, c.note, c.created_by, c.created_at,
               s.name as proveedor,
               ${nombreProfesional("c.created_by")} as responsable
          from erp.purchases c
          left join erp.suppliers s on s.id = c.supplier_id
         where ${where}
         order by c.created_at desc limit ${limite}`,
  );
  if (filas.length === 0)
    return { filas, lineas: new Map<string, FilaLinea[]>() };

  const todas = await query<FilaLinea>(
    db,
    sql`select i.id, i.purchase_id, i.product_id, i.quantity, i.unit_cost_cents,
               p.name as producto
          from erp.purchase_items i
          left join erp.products p on p.id = i.product_id
         where i.purchase_id = any(${sql.param(filas.map((f) => f.id))}::uuid[])`,
  );

  const lineas = new Map<string, FilaLinea[]>();
  for (const linea of todas) {
    const lista = lineas.get(linea.purchase_id) ?? [];
    lista.push(linea);
    lineas.set(linea.purchase_id, lista);
  }
  return { filas, lineas };
}

export async function listPurchases(limite = 100): Promise<Purchase[]> {
  const vet = await requireErp();

  const { filas, lineas } = await compras(
    sql`c.institution_id = ${vet.institucionId}`,
    limite,
  ).catch((error) => {
    console.error("listPurchases", error);
    return { filas: [], lineas: new Map<string, FilaLinea[]>() };
  });

  return filas.map((compra) =>
    toPurchase(
      compra,
      lineas.get(compra.id) ?? [],
      compra.proveedor ?? "—",
      compra.responsable ?? "—",
    ),
  );
}
