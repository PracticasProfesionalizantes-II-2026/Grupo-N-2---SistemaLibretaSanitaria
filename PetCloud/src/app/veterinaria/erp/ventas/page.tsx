import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { SalesView } from "@/features/erp/components/sales/sales-view";
import { listBarcodes } from "@/features/erp/data/barcodes";
import { listCustomers } from "@/features/erp/data/customers";
import { listPaymentMethods, listSales } from "@/features/erp/data/sales";
import { listProducts } from "@/features/erp/data/stock";

export const metadata: Metadata = { title: "Ventas" };

/**
 * El acceso ya lo resolvió el layout del ERP con `requireErp()`. Cada
 * lectura lo vuelve a exigir por su cuenta, y además está gateada por el
 * permiso `ventas` en la base (migración 100/104): a diferencia de Caja y
 * Compras, `ventas` está abierto a cualquier miembro Premium desde el día
 * uno (decisión 5), así que no hay control de owner adicional acá.
 */
export default async function VentasPage() {
  const [ventas, metodosPago, clientes, productos, codigosBarra] =
    await Promise.all([
      listSales(),
      listPaymentMethods(),
      listCustomers(),
      listProducts(),
      listBarcodes(),
    ]);

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Cada venta descuenta stock y cobra en efectivo, tarjeta, transferencia o cuenta corriente, todo en un solo paso."
      />

      <div className="mt-6">
        <SalesView
          ventas={ventas}
          metodosPago={metodosPago}
          clientes={clientes}
          productos={productos}
          codigosBarra={codigosBarra}
        />
      </div>
    </div>
  );
}
