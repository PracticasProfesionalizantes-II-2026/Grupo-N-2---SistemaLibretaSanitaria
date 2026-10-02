import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { CustomersView } from "@/features/erp/components/customers/customers-view";
import { listCustomers } from "@/features/erp/data/customers";

export const metadata: Metadata = { title: "Clientes" };

/**
 * El acceso ya lo resolvió el layout del ERP con `requireErp()`. `listCustomers()`
 * lo vuelve a exigir por su cuenta, y además está gateado por el módulo
 * 'ventas' en la base (migración 104) — que, por decisión 5, lo tiene
 * cualquier miembro Premium desde el día uno.
 */
export default async function ClientesPage() {
  const clientes = await listCustomers();

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Los datos de cada cliente y su cuenta corriente. Si el saldo es negativo, el cliente tiene plata a favor."
      />

      <div className="mt-6">
        <CustomersView clientes={clientes} />
      </div>
    </div>
  );
}
