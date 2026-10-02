"use client";

import { forwardRef, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resolveByCode,
  searchProducts,
  type ProductIndex,
} from "@/features/erp/lib/product-index";
import {
  ESTADO_INICIAL,
  feedKey,
  type ScanBufferState,
} from "@/features/erp/lib/scan-buffer";
import type { Product } from "@/types/erp";

/**
 * La entrada de captura del mostrador.
 *
 * Es un `<input>` real y etiquetado, no un listener global de `window`: así
 * un escaneo apuntado a otro campo cae en ese campo y no acá, sin robarle
 * dígitos a nada. `feedKey` decide si lo que llegó fue una ráfaga de lector
 * — se resuelve por código exacto — o hay que caer al fallback tipeado, que
 * busca por nombre/`sku`/categoría sobre el valor completo del input (no
 * sobre el buffer de ráfaga, que un tipeo humano lento reinicia seguido).
 *
 * El resultado ambiguo (más de un producto por el término tipeado) no está
 * previsto: se agrega una lista clickeable mínima porque el spec exige
 * que el fallback tipeado "resuelva" un producto, y una búsqueda de mostrador
 * puede calzar con más de uno (dos productos con el mismo `sku` truncado por
 * ejemplo). Documentado en el reporte de apply, no inventado en silencio.
 */
export const ScanInput = forwardRef<
  HTMLInputElement,
  {
    index: ProductIndex;
    productos: Product[];
    onResolve: (productId: string) => void;
  }
>(function ScanInput({ index, productos, onResolve }, ref) {
  const [valor, setValor] = useState("");
  const [codigoDesconocido, setCodigoDesconocido] = useState<string | null>(
    null,
  );
  const [coincidencias, setCoincidencias] = useState<Product[]>([]);

  // No es estado de React: nadie lo muestra en pantalla, y hacerlo estado
  // forzaría un render por cada tecla de una ráfaga de 13 dígitos.
  const bufferRef = useRef<ScanBufferState>(ESTADO_INICIAL);

  function limpiar() {
    setValor("");
    setCoincidencias([]);
    bufferRef.current = ESTADO_INICIAL;
  }

  function resolver(productId: string) {
    setCodigoDesconocido(null);
    limpiar();
    onResolve(productId);
  }

  function manejarEnter(scan: string | undefined, valorTipeado: string) {
    if (scan) {
      const productoExacto = resolveByCode(index, scan);
      if (productoExacto) {
        resolver(productoExacto);
        return;
      }
    }

    const termino = valorTipeado.trim();
    if (termino.length === 0) return;

    const ids = searchProducts(index, termino);

    if (ids.length === 1) {
      resolver(ids[0]);
      return;
    }

    limpiar();

    if (ids.length > 1) {
      setCodigoDesconocido(null);
      setCoincidencias(
        ids
          .map((id) => productos.find((producto) => producto.id === id))
          .filter((producto): producto is Product => Boolean(producto)),
      );
      return;
    }

    // Sin `scan` ni coincidencias por nombre/sku/categoría: canal propio,
    // distinto del error de validación del formulario y del toast del
    // servidor.
    setCodigoDesconocido(termino);
  }

  function manejarKeyDown(evento: KeyboardEvent<HTMLInputElement>) {
    const { state, scan } = feedKey(bufferRef.current, {
      key: evento.key,
      at: evento.timeStamp,
    });
    bufferRef.current = state;

    // `preventDefault`: este input no vive dentro del `<form>` del pago, pero
    // el Enter de un escaneo no tiene que hacer nada más que resolverse acá.
    if (evento.key === "Enter") {
      evento.preventDefault();
      manejarEnter(scan, valor);
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor="scan-input">Escaneá o buscá un producto</Label>
        <Input
          id="scan-input"
          ref={ref}
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
          onKeyDown={manejarKeyDown}
          placeholder="Código de barras, nombre o código interno"
          autoComplete="off"
        />
      </div>

      {codigoDesconocido ? (
        <Alert variant="danger">
          Ese código no está registrado: {codigoDesconocido}. Cargalo en Stock o
          buscá el producto por nombre.
        </Alert>
      ) : null}

      {coincidencias.length > 0 ? (
        <div className="rounded-lg border p-2">
          <p className="text-muted-foreground mb-1 text-xs">
            Más de un producto coincide. Elegí uno:
          </p>
          <ul className="space-y-1">
            {coincidencias.map((producto) => (
              <li key={producto.id}>
                <button
                  type="button"
                  className="hover:bg-muted w-full rounded px-2 py-1 text-left text-sm"
                  onClick={() => resolver(producto.id)}
                >
                  {producto.nombre}
                  {producto.sku ? ` — ${producto.sku}` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
});
