import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { CashView } from "@/features/erp/components/cash/cash-view";
import { getCashAccount, listCashMovements } from "@/features/erp/data/cash";

export const metadata: Metadata = { title: "Caja" };

/**
 * El acceso ya lo resolvió el layout del ERP con `requireErp()`. Cada lectura
 * (`getCashAccount`, `listCashMovements`) lo vuelve a exigir por su cuenta, y
 * además está gateada por el permiso `caja` en la base (migración 104):
 * quien no es titular ni tiene el permiso delegado ve la caja vacía, no un
 * error — mismo criterio que el resto del ERP.
 */
export default async function CajaPage() {
  const [cuenta, movimientos] = await Promise.all([
    getCashAccount(),
    listCashMovements(),
  ]);

  return (
    <div>
      <PageHeader
        title="Caja"
        description="Todo lo que entra y sale del cajón en efectivo. Registrá un arqueo cuando cuentes el efectivo del cajón."
      />

      <div className="mt-6">
        <CashView cuenta={cuenta} movimientos={movimientos} />
      </div>
    </div>
  );
}
