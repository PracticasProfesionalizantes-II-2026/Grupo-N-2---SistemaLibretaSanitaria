import { etiquetaDeUnidad } from "@/features/erp/lib/unit-label";
import type { Product, ProductUnit } from "@/types/erp";

/**
 * Qué líneas del carrito piden más stock del que hay.
 *
 * **Esto es interfaz, no seguridad.** La defensa real sigue siendo el trigger
 * `erp_movements_check_stock` (migración 102), que llama a
 * `erp.check_stock_suficiente()` y hace RAISE cuando `stock + quantity < 0`.
 * El problema es *cuándo* avisa: `erp.register_sale()` es una sola
 * transacción, así que esa excepción no rechaza la línea culpable sino la
 * venta entera. Traducido al mostrador, el cajero escanea seis productos,
 * aprieta "Registrar venta" y se le cae todo con el cliente enfrente.
 *
 * Por eso el aviso se adelanta acá: la línea se marca mientras se arma el
 * carrito, y "Registrar venta" queda deshabilitado hasta que se corrija. Nada
 * de esto reemplaza al trigger — el navegador miente y el stock cambia entre
 * que se carga la pantalla y se aprieta el botón.
 *
 * Vive en `lib/` y es puro por el mismo motivo que `sale-pricing.ts` y
 * `cash-change.ts`: sin React ni base de datos, los casos raros quedan decididos
 * por escrito y probados, no enterrados en un `map` adentro del JSX.
 */

/**
 * Una línea del carrito, tal como llega del formulario **antes** de que zod la
 * valide.
 *
 * Los dos campos son opcionales y `cantidad` puede ser `NaN` a propósito: una
 * línea recién agregada por "Agregar línea" arranca sin producto elegido, y el
 * `valueAsNumber` del input deja `NaN` mientras el campo está vacío. Tipar esto
 * como `SaleLineValues` sería mentir sobre el estado real y obligaría a un
 * cast en el único lugar que importa.
 */
export type LineaDeCarrito = {
  productoId?: string;
  cantidad?: number;
};

/** Un producto del carrito que no entra en el stock que hay. */
export type FaltaDeStock = {
  productoId: string;
  unidad: ProductUnit;
  /** Lo pedido sumando **todas** las líneas de ese producto, no una sola. */
  pedido: number;
  /** Lo que hay en la base. Puede ser negativo: ver `StockStatus`. */
  disponible: number;
  /** En cuántas líneas del carrito aparece el producto. */
  lineas: number;
};

/**
 * Los productos del carrito que no entran en el stock, indexados por id.
 *
 * **Suma por producto, no por línea, y eso es el punto.** El mismo producto
 * puede estar en dos líneas: el escaneo incrementa la que ya existe, pero
 * "Agregar línea" deja elegirlo de nuevo. Dos líneas de 3 contra 5 de stock no
 * exceden nada por separado y sí juntas — es exactamente lo que el trigger va
 * a rechazar, porque `register_sale()` descuenta las dos en la misma
 * transacción.
 *
 * Lo que queda deliberadamente afuera:
 *
 *   · **Línea sin producto elegido** → no hay stock del que hablar. De eso ya
 *     se queja `saleSchema` con "Elegí el producto".
 *   · **Cantidad que no es un número** (el `NaN` de un campo vacío) → todavía
 *     no pide nada, así que no puede faltar nada. Suma cero. Marcarla en rojo
 *     sería acusar a alguien de un error que no cometió todavía.
 *   · **Cantidad negativa o cero** → suma cero por lo mismo, y además
 *     `saleSchema` ya la rechaza. Restarla del total pedido dejaría pasar una
 *     venta que el trigger sí va a frenar.
 *   · **Producto que no está en el catálogo** → sin stock conocido no hay
 *     comparación honesta que hacer. No se inventa un faltante ni se asume
 *     que hay de sobra: se deja pasar y decide el trigger, que es el que sabe.
 */
export function faltantesDeStock(
  lineas: readonly LineaDeCarrito[],
  productos: readonly Product[],
): Map<string, FaltaDeStock> {
  const pedidoPorProducto = new Map<
    string,
    { pedido: number; lineas: number }
  >();

  for (const linea of lineas) {
    const productoId = linea.productoId;
    if (!productoId) continue;

    const acumulado = pedidoPorProducto.get(productoId) ?? {
      pedido: 0,
      lineas: 0,
    };

    const cantidad = linea.cantidad ?? 0;
    const pedido = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 0;

    pedidoPorProducto.set(productoId, {
      pedido: acumulado.pedido + pedido,
      lineas: acumulado.lineas + 1,
    });
  }

  const faltantes = new Map<string, FaltaDeStock>();

  for (const [productoId, acumulado] of pedidoPorProducto) {
    const producto = productos.find((candidato) => candidato.id === productoId);
    if (!producto) continue;

    // `pedido > 0` aparte de la comparación, y no es redundante: con el stock
    // ya en negativo, `0 > -2` sería cierto y marcaría en rojo una línea que
    // todavía no pide nada. El aviso gris de `textoDeStock()` ya cuenta ese
    // caso sin bloquear a nadie.
    if (acumulado.pedido <= 0) continue;
    if (acumulado.pedido <= producto.stock) continue;

    faltantes.set(productoId, {
      productoId,
      unidad: producto.unidad,
      pedido: acumulado.pedido,
      disponible: producto.stock,
      lineas: acumulado.lineas,
    });
  }

  return faltantes;
}

/**
 * El error que va debajo del selector de producto de una línea marcada.
 *
 * Dice qué hacer y no solo qué está mal: quien está en el mostrador con el
 * cliente enfrente no necesita enterarse de que hay un problema, necesita la
 * salida. Las dos salidas reales son bajar la cantidad o cargar la entrada que
 * falta desde Stock → "Registrar movimiento" (el ajuste manual), y las dos
 * están escritas.
 *
 * Los tres estados se dicen distinto por el mismo motivo que en
 * `textoDeStock()`: el negativo no significa "se acabó" sino "falta cargar una
 * entrada", y confundirlos manda a alguien a comprar mercadería que ya está en
 * el depósito.
 */
export function textoDeFalta(falta: FaltaDeStock): string {
  const unidad = etiquetaDeUnidad(falta.unidad, falta.disponible).toLowerCase();

  if (falta.disponible < 0) {
    return `El stock está en negativo (${falta.disponible} ${unidad}): cargá la entrada que falta desde Stock → «Registrar movimiento» antes de vender.`;
  }

  if (falta.disponible === 0) {
    return "Sin stock: no queda nada para vender. Cargá la entrada desde Stock → «Registrar movimiento».";
  }

  // Con el producto repetido, el total pedido no coincide con la cantidad que
  // se está mirando en esta línea. Decirlo evita que "pedís 6" arriba de un
  // campo que dice 3 se lea como un error de la pantalla.
  const pedido =
    falta.lineas > 1
      ? `Pedís ${falta.pedido} entre ${falta.lineas} líneas`
      : `Pedís ${falta.pedido}`;

  return `${pedido} y quedan ${falta.disponible} ${unidad}. Bajá la cantidad o cargá la entrada desde Stock → «Registrar movimiento».`;
}
