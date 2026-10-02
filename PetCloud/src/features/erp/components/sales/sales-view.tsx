"use client";

import { ShoppingCart } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { voidSale } from "@/features/erp/actions/sale-actions";
import { getSaleAction } from "@/features/erp/actions/sale-detail-action";
import { SaleForm } from "@/features/erp/components/sales/sale-form";
import type { Barcode } from "@/features/erp/lib/product-index";
import {
  PAYMENT_METHOD_LABELS,
  type Customer,
  type PaymentMethod,
  type Product,
  type Sale,
  type SaleItem,
} from "@/types/erp";
import { ZONA } from "@/lib/argentina-time";

/**
 * Ventas en una sola pantalla, partida en dos: el formulario a la izquierda y
 * el historial a la derecha.
 *
 * **El alta ya no vive en un modal.** Registrar una venta es lo que se hace en
 * esta pantalla, no una excepción que valga interrumpir con una ventana: el
 * formulario está siempre armado y visible, así que la venta empieza con el
 * primer dato y no con un clic para abrir. Con el cliente esperando en el
 * mostrador, ese clic es el peor lugar donde gastar tiempo.
 *
 * El reparto 3/2 de la grilla de cinco columnas no es simetría fallida: el
 * formulario tiene campos que se escriben y necesita el ancho; el historial se
 * consulta de reojo y le alcanza con menos. Debajo de `lg` la grilla se
 * deshace y el formulario queda arriba, que es el orden en que ya están en el
 * marcado — primero se vende, después se revisa.
 *
 * Componente de cliente por el detalle expandible y la anulación, igual que
 * `PurchasesView`: no trae los datos, los recibe resueltos del Server
 * Component de la página, y pide las líneas de una venta puntual bajo
 * demanda (`getSaleAction`) para no traer todas las líneas de las cien
 * últimas ventas por adelantado.
 *
 * Anular pasa por `erp.void_sale()` (109) vía `voidSale()`. La confirmación
 * dice explícitamente qué se revierte, según el método de pago de la venta:
 * el stock siempre vuelve, y el cobro se revierte en caja (efectivo) o en
 * cuenta corriente (cuenta corriente) — tarjeta y transferencia no
 * postearon a ningún libro, así que la confirmación no promete revertir
 * ninguno.
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

export function SalesView({
  ventas,
  metodosPago,
  clientes,
  productos,
  codigosBarra,
}: {
  ventas: Sale[];
  metodosPago: PaymentMethod[];
  clientes: Customer[];
  productos: Product[];
  codigosBarra: Barcode[];
}) {
  const [ventaExpandida, setVentaExpandida] = useState<string | null>(null);
  const [lineas, setLineas] = useState<SaleItem[]>([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [ventaAAnular, setVentaAAnular] = useState<Sale | null>(null);
  const [anulando, setAnulando] = useState(false);

  const metodoPorCodigo = new Map(
    metodosPago.map((metodo) => [metodo.code, metodo]),
  );

  function descripcionAnulacion(venta: Sale) {
    const metodo = metodoPorCodigo.get(venta.metodoPago);
    const partes = ["El stock de sus líneas vuelve al inventario"];

    if (metodo?.postsCash) {
      partes.push("y se revierte el cobro en caja");
    } else if (metodo?.postsAccount) {
      partes.push("y se revierte la deuda en la cuenta corriente del cliente");
    }

    return `${partes.join(" ")}. Esta acción no se puede deshacer.`;
  }

  async function confirmarAnulacion() {
    if (!ventaAAnular) return;

    setAnulando(true);
    const resultado = await voidSale({ ventaId: ventaAAnular.id });
    setAnulando(false);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success("Venta anulada.");
    setVentaAAnular(null);
  }

  async function alternarDetalle(ventaId: string) {
    if (ventaExpandida === ventaId) {
      setVentaExpandida(null);
      return;
    }

    setVentaExpandida(ventaId);
    setCargandoLineas(true);
    const detalle = await getSaleAction(ventaId);
    setLineas(detalle?.lineas ?? []);
    setCargandoLineas(false);
  }

  return (
    /*
      El historial YA NO comparte la grilla de dos columnas con el
      formulario: es una superficie de revisión, no de
      mostrador, y competirle ancho horizontal al ticket activo es
      exactamente lo que se quería dejar de hacer. El split carrito/pago
      ahora vive DENTRO de `SaleForm` (ver su propio comentario) — acá solo
      queda una columna vertical: primero la venta en curso, después la
      lista completa abajo, sin `order`/`lg:order` porque ya no hace falta
      invertir nada visualmente.
    */
    <div className="space-y-6">
      <SaleForm
        metodosPago={metodosPago}
        clientes={clientes}
        productos={productos}
        codigosBarra={codigosBarra}
      />

      <section className="min-w-0 space-y-3">
        <h2 className="text-foreground text-lg font-semibold">
          Últimas ventas
        </h2>

        {ventas.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Todavía no se registró ninguna venta"
            description="Una venta descuenta stock y cobra en efectivo, tarjeta, transferencia o cuenta corriente, todo en un solo paso."
          />
        ) : (
          /* El historial crece sin techo y el formulario no: sin un alto máximo
           propio, cien ventas estiran la página y dejan el alta fuera de
           pantalla justo cuando se la quiere usar. */
          <div className="max-h-[40rem] overflow-y-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH>Método</TH>
                  <TH>Total</TH>
                  <TH>Fecha</TH>
                  <TH aria-label="Estado" />
                </TR>
              </THead>
              <TBody>
                {ventas.map((venta) => (
                  <Fragment key={venta.id}>
                    <TR>
                      <TD>
                        <button
                          type="button"
                          className="font-medium underline-offset-2 hover:underline"
                          onClick={() => alternarDetalle(venta.id)}
                        >
                          {venta.clienteNombre ?? "Consumidor final"}
                        </button>
                      </TD>
                      <TD>{PAYMENT_METHOD_LABELS[venta.metodoPago]}</TD>
                      <TD>{pesos.format(venta.totalPesos)}</TD>
                      <TD>{fecha.format(new Date(venta.fecha))}</TD>
                      <TD>
                        {venta.status === "voided" ? (
                          <Badge variant="neutral">Anulada</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setVentaAAnular(venta)}
                          >
                            Anular
                          </Button>
                        )}
                      </TD>
                    </TR>

                    {ventaExpandida === venta.id && (
                      <TR>
                        <TD colSpan={5}>
                          {cargandoLineas ? (
                            <p className="text-muted-foreground py-2 text-sm">
                              Cargando líneas…
                            </p>
                          ) : lineas.length === 0 ? (
                            <p className="text-muted-foreground py-2 text-sm">
                              Sin líneas.
                            </p>
                          ) : (
                            <Table>
                              <THead>
                                <TR>
                                  <TH>Producto</TH>
                                  <TH>Cantidad</TH>
                                  <TH>Precio unitario</TH>
                                </TR>
                              </THead>
                              <TBody>
                                {lineas.map((linea) => (
                                  <TR key={linea.id}>
                                    <TD>{linea.productoNombre}</TD>
                                    <TD>{linea.cantidad}</TD>
                                    <TD>
                                      {pesos.format(linea.precioUnitario)}
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
          </div>
        )}
      </section>

      <ConfirmDialog
        open={ventaAAnular !== null}
        onClose={() => setVentaAAnular(null)}
        onConfirm={confirmarAnulacion}
        title="¿Anular esta venta?"
        description={ventaAAnular ? descripcionAnulacion(ventaAAnular) : ""}
        confirmLabel="Anular venta"
        loading={anulando}
        loadingLabel="Anulando..."
      />
    </div>
  );
}
