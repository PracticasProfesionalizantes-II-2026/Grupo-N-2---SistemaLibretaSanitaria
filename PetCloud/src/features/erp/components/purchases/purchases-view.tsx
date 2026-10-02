"use client";

import { Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { setSupplierActive } from "@/features/erp/actions/purchase-actions";
import { PurchaseModal } from "@/features/erp/components/purchases/purchase-modal";
import { SupplierModal } from "@/features/erp/components/purchases/supplier-modal";
import type { Product, Purchase, Supplier } from "@/types/erp";
import { ZONA } from "@/lib/argentina-time";

/**
 * Compras y proveedores en una sola pantalla.
 *
 * Igual que `StockView`: componente de cliente por los dos modales, pero no
 * trae datos — los recibe resueltos del Server Component de la página
 *.
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

export function PurchasesView({
  proveedores,
  compras,
  productos,
}: {
  proveedores: Supplier[];
  compras: Purchase[];
  productos: Product[];
}) {
  const [modalProveedor, setModalProveedor] = useState(false);
  const [modalCompra, setModalCompra] = useState(false);

  async function alternarActivo(proveedor: Supplier) {
    const resultado = await setSupplierActive(proveedor.id, !proveedor.activo);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success(
      proveedor.activo ? "Proveedor desactivado" : "Proveedor reactivado",
    );
  }

  const proveedoresActivos = proveedores.filter((p) => p.activo);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Proveedores</h2>
          <Button variant="outline" onClick={() => setModalProveedor(true)}>
            Nuevo proveedor
          </Button>
        </div>

        {proveedores.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Todavía no cargaste ningún proveedor"
            description="Un proveedor es lo primero que necesita una compra."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>CUIT</TH>
                <TH>Contacto</TH>
                <TH>Estado</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {proveedores.map((proveedor) => (
                <TR key={proveedor.id}>
                  <TD>{proveedor.nombre}</TD>
                  <TD>{proveedor.cuit ?? "—"}</TD>
                  <TD>{proveedor.telefono ?? proveedor.email ?? "—"}</TD>
                  <TD>
                    <Badge variant={proveedor.activo ? "success" : "neutral"}>
                      {proveedor.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TD>
                  <TD>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alternarActivo(proveedor)}
                    >
                      {proveedor.activo ? "Desactivar" : "Reactivar"}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Compras</h2>
          <Button
            onClick={() => setModalCompra(true)}
            disabled={proveedoresActivos.length === 0 || productos.length === 0}
            title={
              proveedoresActivos.length === 0
                ? "Necesitás un proveedor activo para registrar una compra"
                : productos.length === 0
                  ? "Necesitás al menos un producto cargado en Stock"
                  : undefined
            }
          >
            Registrar compra
          </Button>
        </div>

        {compras.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Todavía no registraste ninguna compra"
            description="Cada compra suma stock y actualiza el costo del producto."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Proveedor</TH>
                <TH>Total</TH>
                <TH>Responsable</TH>
                <TH>Nota</TH>
              </TR>
            </THead>
            <TBody>
              {compras.map((compra) => (
                <TR key={compra.id}>
                  <TD>{fecha.format(new Date(compra.fecha))}</TD>
                  <TD>{compra.proveedorNombre}</TD>
                  <TD>{pesos.format(compra.totalPesos)}</TD>
                  <TD>{compra.responsable}</TD>
                  <TD>{compra.nota ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <SupplierModal
        open={modalProveedor}
        onClose={() => setModalProveedor(false)}
      />

      <PurchaseModal
        open={modalCompra}
        onClose={() => setModalCompra(false)}
        proveedores={proveedoresActivos}
        productos={productos}
      />
    </div>
  );
}
