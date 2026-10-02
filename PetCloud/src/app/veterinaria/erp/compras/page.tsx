import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { PurchasesView } from "@/features/erp/components/purchases/purchases-view";
import { listPurchases, listSuppliers } from "@/features/erp/data/purchases";
import { listProducts } from "@/features/erp/data/stock";

export const metadata: Metadata = { title: "Compras y proveedores" };

/**
 * El acceso ya lo resolvió el layout del ERP con `requireErp()`. Cada lectura
 * (`listSuppliers`, `listPurchases`) lo vuelve a exigir por su cuenta, y
 * además está gateada por el permiso `compras` en la base (migración 104):
 * quien no es titular ni tiene el permiso delegado ve la lista vacía, no un
 * error — mismo criterio que el resto del ERP.
 */
export default async function ComprasPage() {
  const [proveedores, compras, productos] = await Promise.all([
    listSuppliers(),
    listPurchases(),
    listProducts(),
  ]);

  return (
    <div>
      <PageHeader
        title="Compras y proveedores"
        description="Cada compra suma stock y actualiza el costo del producto al valor de la última compra."
      />

      <div className="mt-6">
        <PurchasesView
          proveedores={proveedores}
          compras={compras}
          productos={productos}
        />
      </div>
    </div>
  );
}
