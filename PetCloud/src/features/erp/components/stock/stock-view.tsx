"use client";

import { Boxes, Pencil, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { setProductActive } from "@/features/erp/actions/stock-actions";
import { MovementModal } from "@/features/erp/components/stock/movement-modal";
import { ProductModal } from "@/features/erp/components/stock/product-modal";
import type { Product, StockStatus } from "@/types/erp";
import { etiquetaDeUnidad } from "@/features/erp/lib/unit-label";

/**
 * Catálogo y stock actual.
 *
 * Es un componente de cliente porque tiene búsqueda, filtro y dos modales. Lo
 * que NO hace es traer datos: los recibe ya resueltos desde el Server
 * Component de la página. Ese es el corte que evita que el módulo termine
 * mandando media pantalla de JavaScript al navegador.
 */

const ESTADO_BADGE: Record<
  StockStatus,
  { variant: "success" | "warning" | "danger" | "neutral"; label: string }
> = {
  ok: { variant: "success", label: "En stock" },
  bajo: { variant: "warning", label: "Reponer" },
  "sin-stock": { variant: "neutral", label: "Sin stock" },
  // Negativo se muestra distinto de sin-stock a propósito: no es que se acabó,
  // es que falta cargar una entrada. Ver el comentario de la política de
  // INSERT de `stock_movements` (migración 101).
  negativo: { variant: "danger", label: "Revisar carga" },
};

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export function StockView({
  productos,
  soloReponerInicial = false,
}: {
  productos: Product[];
  /** Llega desde la portada del ERP: "productos bajo el mínimo". */
  soloReponerInicial?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [soloReponer, setSoloReponer] = useState(soloReponerInicial);
  const [verInactivos, setVerInactivos] = useState(false);
  const [productoEnEdicion, setProductoEnEdicion] = useState<Product>();
  const [modalProducto, setModalProducto] = useState(false);
  const [modalMovimiento, setModalMovimiento] = useState(false);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return productos.filter((producto) => {
      if (!verInactivos && !producto.activo) return false;
      if (soloReponer && producto.estado === "ok") return false;
      if (!termino) return true;

      return (
        producto.nombre.toLowerCase().includes(termino) ||
        producto.sku?.toLowerCase().includes(termino) ||
        producto.categoria?.toLowerCase().includes(termino)
      );
    });
  }, [productos, busqueda, verInactivos, soloReponer]);

  const aReponer = productos.filter(
    (producto) => producto.activo && producto.estado !== "ok",
  ).length;

  async function alternarActivo(producto: Product) {
    const resultado = await setProductActive(producto.id, !producto.activo);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success(
      producto.activo ? "Producto desactivado" : "Producto reactivado",
    );
  }

  function abrirAlta() {
    setProductoEnEdicion(undefined);
    setModalProducto(true);
  }

  function abrirEdicion(producto: Product) {
    setProductoEnEdicion(producto);
    setModalProducto(true);
  }

  return (
    <div className="space-y-5">
      {/* Solo flex-wrap, sin breakpoints de viewport: al lado del sidebar el
          ancho real del contenido no tiene relación con el de la ventana. Si
          no entran en la misma fila, los botones bajan en vez de pisar nada. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por nombre, código o categoría"
            className="min-w-0 flex-[1_1_20rem]"
            aria-label="Buscar producto"
          />

          <div className="flex max-w-full min-w-0 flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setModalMovimiento(true)}
              disabled={productos.length === 0}
            >
              Registrar movimiento
            </Button>
            <Button onClick={abrirAlta}>
              <Plus className="size-4" />
              Nuevo producto
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="text-muted-foreground flex items-center gap-2 text-sm whitespace-nowrap">
            <Checkbox
              checked={soloReponer}
              onChange={(evento) => setSoloReponer(evento.target.checked)}
              className="mt-0"
            />
            Solo para reponer
          </label>

          <label className="text-muted-foreground flex items-center gap-2 text-sm whitespace-nowrap">
            <Checkbox
              checked={verInactivos}
              onChange={(evento) => setVerInactivos(evento.target.checked)}
              className="mt-0"
            />
            Ver inactivos
          </label>
        </div>
      </div>

      {aReponer > 0 ? (
        <p className="text-warning bg-warning-soft rounded-lg px-4 py-3 text-sm font-medium">
          {aReponer === 1
            ? "Hay 1 producto para revisar o reponer."
            : `Hay ${aReponer} productos para revisar o reponer.`}
        </p>
      ) : null}

      {visibles.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={
            productos.length === 0
              ? "Todavía no cargaste ningún producto"
              : "Ningún producto coincide con la búsqueda"
          }
          description={
            productos.length === 0
              ? "Cargá el catálogo una vez y después el stock se mueve solo, con cada compra y cada venta."
              : undefined
          }
          action={
            productos.length === 0 ? (
              <Button onClick={abrirAlta}>Cargar el primero</Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Producto</TH>
              <TH>Categoría</TH>
              <TH className="text-right">Stock</TH>
              <TH className="text-right">Costo</TH>
              <TH className="text-right">Precio</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {visibles.map((producto) => {
              const badge = ESTADO_BADGE[producto.estado];

              return (
                <TR
                  key={producto.id}
                  className={producto.activo ? undefined : "opacity-55"}
                >
                  <TD>
                    <span className="text-foreground block font-medium">
                      {producto.nombre}
                    </span>
                    {producto.sku ? (
                      <span className="text-muted-foreground block text-xs">
                        {producto.sku}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="text-muted-foreground">
                    {producto.categoria ?? "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {producto.stock}{" "}
                    {etiquetaDeUnidad(producto.unidad, producto.stock)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {pesos.format(producto.costo)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {pesos.format(producto.precio)}
                  </TD>
                  <TD>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => abrirEdicion(producto)}
                        aria-label={`Editar ${producto.nombre}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => alternarActivo(producto)}
                        aria-label={
                          producto.activo
                            ? `Desactivar ${producto.nombre}`
                            : `Reactivar ${producto.nombre}`
                        }
                        title={
                          producto.activo
                            ? "Desactivar: deja de aparecer en ventas, su historial queda"
                            : "Reactivar"
                        }
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {/* `key` fuerza a react-hook-form a remontar con los defaults del
          producto elegido: sin esto, editar un segundo producto mostraría los
          valores del primero. */}
      <ProductModal
        key={productoEnEdicion?.id ?? "alta"}
        open={modalProducto}
        onClose={() => setModalProducto(false)}
        producto={productoEnEdicion}
      />

      <MovementModal
        open={modalMovimiento}
        onClose={() => setModalMovimiento(false)}
        productos={productos}
      />
    </div>
  );
}
