import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { StockView } from "@/features/erp/components/stock/stock-view";
import { listProducts } from "@/features/erp/data/stock";

export const metadata: Metadata = { title: "Stock" };

/**
 * El acceso ya lo resolvió el layout del ERP con `requireErp()`; `listProducts()`
 * lo vuelve a exigir por su cuenta, porque una lectura tiene que protegerse
 * sola y no confiar en quién la llamó.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const [productos, { filtro }] = await Promise.all([
    listProducts(),
    searchParams,
  ]);

  return (
    <div>
      <PageHeader
        title="Stock"
        description="El catálogo y lo que hay hoy en el estante. Cada movimiento queda registrado con nombre y fecha."
      />

      <div className="mt-6">
        <StockView
          productos={productos}
          soloReponerInicial={filtro === "reponer"}
        />
      </div>
    </div>
  );
}
