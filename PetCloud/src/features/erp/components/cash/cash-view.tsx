"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { voidCashMovement } from "@/features/erp/actions/cash-actions";
import { ArqueoModal } from "@/features/erp/components/cash/arqueo-modal";
import { MovementModal } from "@/features/erp/components/cash/movement-modal";
import { CASH_MOVEMENT_KIND_LABELS } from "@/types/erp";
import type { CashAccount, CashMovement } from "@/types/erp";
import { ZONA } from "@/lib/argentina-time";

/**
 * Caja en una sola pantalla.
 *
 * Componente de cliente por los dos modales, igual que `PurchasesView`: no
 * trae datos, los recibe resueltos del Server Component de la página.
 */

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const fecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  dateStyle: "short",
  timeStyle: "short",
});

export function CashView({
  cuenta,
  movimientos,
}: {
  cuenta: CashAccount | null;
  movimientos: CashMovement[];
}) {
  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [modalArqueo, setModalArqueo] = useState(false);

  const saldoPesos = cuenta?.saldoPesos ?? 0;

  async function anular(movimiento: CashMovement) {
    const resultado = await voidCashMovement({ movimientoId: movimiento.id });

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success("Movimiento anulado");
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">Saldo del cajón</p>
          <p className="text-2xl font-semibold">{pesos.format(saldoPesos)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setModalArqueo(true)}>
            Registrar arqueo
          </Button>
          <Button onClick={() => setModalMovimiento(true)}>
            Nuevo movimiento
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Movimientos</h2>

        {movimientos.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Todavía no hay movimientos de caja"
            description="Caja chica, retiros, pagos a proveedores y arqueos aparecen acá."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Tipo</TH>
                <TH>Monto</TH>
                <TH>Nota</TH>
                <TH>Responsable</TH>
                <TH>Fecha</TH>
                <TH>Estado</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {movimientos.map((movimiento) => (
                <TR key={movimiento.id}>
                  <TD>{CASH_MOVEMENT_KIND_LABELS[movimiento.tipo]}</TD>
                  <TD>{pesos.format(movimiento.montoPesos)}</TD>
                  <TD>{movimiento.nota ?? "—"}</TD>
                  <TD>{movimiento.responsable}</TD>
                  <TD>{fecha.format(new Date(movimiento.fecha))}</TD>
                  <TD>
                    {movimiento.anulado ? (
                      <Badge variant="neutral">Anulado</Badge>
                    ) : movimiento.esContrasiento ? (
                      <Badge variant="neutral">Anulación</Badge>
                    ) : (
                      <Badge variant="success">Vigente</Badge>
                    )}
                  </TD>
                  <TD>
                    {!movimiento.anulado && !movimiento.esContrasiento && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => anular(movimiento)}
                      >
                        Anular
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <MovementModal
        open={modalMovimiento}
        onClose={() => setModalMovimiento(false)}
      />
      <ArqueoModal
        open={modalArqueo}
        onClose={() => setModalArqueo(false)}
        saldoSistemaPesos={saldoPesos}
      />
    </div>
  );
}
