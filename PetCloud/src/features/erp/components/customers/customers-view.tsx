"use client";

import { UsersRound } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listAccountMovementsAction } from "@/features/erp/actions/account-movements-action";
import { voidAccountMovement } from "@/features/erp/actions/customer-actions";
import { AccountAdjustmentModal } from "@/features/erp/components/customers/account-adjustment-modal";
import { AccountPaymentModal } from "@/features/erp/components/customers/account-payment-modal";
import { CustomerModal } from "@/features/erp/components/customers/customer-modal";
import {
  ACCOUNT_MOVEMENT_KIND_LABELS,
  CUSTOMER_TAX_CONDITION_LABELS,
  type AccountMovement,
  type Customer,
} from "@/types/erp";
import { ZONA } from "@/lib/argentina-time";

/**
 * Clientes + cuenta corriente en una sola pantalla.
 *
 * Componente de cliente por los modales y el estado de cuenta expandible,
 * igual que `CashView`: no trae los datos, los recibe resueltos del Server
 * Component de la página, y pide el estado de cuenta de un cliente puntual
 * bajo demanda (`listAccountMovementsAction`) para no traer el libro entero
 * de todos los clientes por adelantado.
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

export function CustomersView({ clientes }: { clientes: Customer[] }) {
  const [modalCliente, setModalCliente] = useState(false);
  const [clienteEnEdicion, setClienteEnEdicion] = useState<Customer | null>(
    null,
  );
  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<AccountMovement[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);
  const [modalAjuste, setModalAjuste] = useState<string | null>(null);
  const [modalPago, setModalPago] = useState<string | null>(null);

  async function alternarEstadoDeCuenta(clienteId: string) {
    if (clienteExpandido === clienteId) {
      setClienteExpandido(null);
      return;
    }

    setClienteExpandido(clienteId);
    setCargandoMovimientos(true);
    const datos = await listAccountMovementsAction(clienteId);
    setMovimientos(datos);
    setCargandoMovimientos(false);
  }

  async function anular(movimiento: AccountMovement) {
    const resultado = await voidAccountMovement({
      movimientoId: movimiento.id,
    });

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success("Movimiento anulado");
    if (clienteExpandido) {
      const datos = await listAccountMovementsAction(clienteExpandido);
      setMovimientos(datos);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-end">
        <Button
          onClick={() => {
            setClienteEnEdicion(null);
            setModalCliente(true);
          }}
        >
          Nuevo cliente
        </Button>
      </section>

      {clientes.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Todavía no hay clientes cargados"
          description="Un cliente sirve para las ventas en cuenta corriente y para llevar su historial de pagos."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Cliente</TH>
              <TH>Condición IVA</TH>
              <TH>Saldo</TH>
              <TH>Límite</TH>
              <TH aria-label="Acciones" />
            </TR>
          </THead>
          <TBody>
            {clientes.map((cliente) => (
              <Fragment key={cliente.id}>
                <TR>
                  <TD>
                    <button
                      type="button"
                      className="font-medium underline-offset-2 hover:underline"
                      onClick={() => alternarEstadoDeCuenta(cliente.id)}
                    >
                      {cliente.razonSocial}
                    </button>
                  </TD>
                  <TD>{CUSTOMER_TAX_CONDITION_LABELS[cliente.condicionIva]}</TD>
                  <TD>
                    {pesos.format(cliente.saldoPesos)}
                    {cliente.sobreLimite && (
                      <Badge variant="danger" className="ml-2">
                        Sobre el límite
                      </Badge>
                    )}
                  </TD>
                  <TD>
                    {cliente.limiteCreditoPesos != null
                      ? pesos.format(cliente.limiteCreditoPesos)
                      : "Sin límite"}
                  </TD>
                  <TD>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setClienteEnEdicion(cliente);
                          setModalCliente(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setModalAjuste(cliente.id)}
                      >
                        Ajuste
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setModalPago(cliente.id)}
                      >
                        Pago
                      </Button>
                    </div>
                  </TD>
                </TR>

                {clienteExpandido === cliente.id && (
                  <TR>
                    <TD colSpan={5}>
                      {cargandoMovimientos ? (
                        <p className="text-muted-foreground py-2 text-sm">
                          Cargando estado de cuenta…
                        </p>
                      ) : movimientos.length === 0 ? (
                        <p className="text-muted-foreground py-2 text-sm">
                          Sin movimientos todavía.
                        </p>
                      ) : (
                        <Table>
                          <THead>
                            <TR>
                              <TH>Tipo</TH>
                              <TH>Monto</TH>
                              <TH>Nota</TH>
                              <TH>Fecha</TH>
                              <TH aria-label="Acciones" />
                            </TR>
                          </THead>
                          <TBody>
                            {movimientos.map((movimiento) => (
                              <TR key={movimiento.id}>
                                <TD>
                                  {
                                    ACCOUNT_MOVEMENT_KIND_LABELS[
                                      movimiento.tipo
                                    ]
                                  }
                                  {movimiento.esContrasiento && (
                                    <Badge variant="neutral" className="ml-2">
                                      Anulación
                                    </Badge>
                                  )}
                                  {movimiento.anulado && (
                                    <Badge variant="neutral" className="ml-2">
                                      Anulado
                                    </Badge>
                                  )}
                                </TD>
                                <TD>{pesos.format(movimiento.montoPesos)}</TD>
                                <TD>{movimiento.nota ?? "—"}</TD>
                                <TD>
                                  {fecha.format(new Date(movimiento.fecha))}
                                </TD>
                                <TD>
                                  {!movimiento.anulado &&
                                    !movimiento.esContrasiento && (
                                      <Button
                                        variant="outline"
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
                    </TD>
                  </TR>
                )}
              </Fragment>
            ))}
          </TBody>
        </Table>
      )}

      <CustomerModal
        open={modalCliente}
        onClose={() => setModalCliente(false)}
        cliente={clienteEnEdicion ?? undefined}
      />

      {modalAjuste && (
        <AccountAdjustmentModal
          open={Boolean(modalAjuste)}
          onClose={() => setModalAjuste(null)}
          customerId={modalAjuste}
        />
      )}

      {modalPago && (
        <AccountPaymentModal
          open={Boolean(modalPago)}
          onClose={() => setModalPago(null)}
          customerId={modalPago}
        />
      )}
    </div>
  );
}
