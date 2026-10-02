import { etiquetaDeUnidad } from "@/features/erp/lib/unit-label";
import type { Product } from "@/types/erp";

/**
 * Lo que el formulario de ventas necesita saber de un producto del catálogo:
 * cuánto sale y cuánto queda.
 *
 * Vive en `lib/` y no en el componente por el mismo motivo que
 * `sale-mappers.ts`: no toca la base ni React, así que se prueba sin levantar
 * nada. Y hay algo que probar — el precio que se autocompleta es el que
 * termina cobrándose, así que los casos raros (producto que no está, precio
 * en cero, catálogo vacío) tienen que estar decididos por escrito y no
 * quedar librados a lo que devuelva un `find` que nadie miró.
 */

/**
 * El producto elegido, si es que está.
 *
 * Devuelve `undefined` y no lanza: el `productoId` del formulario es un string
 * libre —viene de un `<select>`, pero también del reseteo, del valor inicial
 * vacío y de cualquier estado intermedio— así que "no está" es un caso normal,
 * no un error.
 */
export function buscarProducto(
  productos: Product[],
  productoId: string,
): Product | undefined {
  if (!productoId) return undefined;
  return productos.find((producto) => producto.id === productoId);
}

/**
 * El precio de lista de un producto, en pesos, listo para escribir en la
 * línea de la venta.
 *
 * `Product.precio` ya viene en pesos: `toProduct()` (`stock-mappers.ts`) lo
 * divide por 100 desde los centavos que guarda la base. O sea que acá no hay
 * ninguna conversión más que hacer, y meterla sería dividir dos veces.
 *
 * Las tres respuestas posibles, y por qué:
 *
 *   · **Producto encontrado, con precio** → ese precio. Es el caso normal:
 *     el dato ya existe en Stock y nadie tiene que volver a tipearlo.
 *   · **Producto encontrado, precio cero o ausente** → `0`, escrito de
 *     verdad en el campo. La tentación es no tocar nada "porque cero no es
 *     un precio"; sería peor. Dejar lo que había —el precio del producto
 *     anterior, por ejemplo— cobra un importe que nadie eligió. El cero se
 *     ve, molesta, y obliga a corregirlo.
 *   · **Producto que no está en la lista** (o `productoId` vacío) → `null`,
 *     que el llamador tiene que leer como "no escribas nada". Nunca
 *     `undefined` ni `NaN`: el campo es numérico y cualquiera de los dos lo
 *     rompe en pantalla y en la validación.
 *
 * El catálogo vacío cae solo en el último caso: sin productos no hay `find`
 * que acierte.
 */
export function precioDeProducto(
  productos: Product[],
  productoId: string,
): number | null {
  const producto = buscarProducto(productos, productoId);
  if (!producto) return null;

  // `Number.isFinite` y no `?? 0`: cubre el `undefined` de un producto
  // incompleto, pero también el `NaN` que dejaría una fila con `price_cents`
  // corrupto. Los dos escriben basura en un campo numérico.
  return Number.isFinite(producto.precio) ? producto.precio : 0;
}

/**
 * El aviso de stock que va debajo del selector de producto.
 *
 * No es adorno: quien vende decide si puede comprometer la línea antes de
 * cargarla, no después de que `erp.check_stock_suficiente()` (102) le rechace
 * la venta entera con el cliente enfrente. Los cuatro estados vienen de
 * `estadoDeStock()` y se dicen distinto a propósito — `negativo` no significa
 * "se acabó" sino "falta cargar una entrada", y confundirlos manda a alguien a
 * comprar mercadería que ya está en el depósito.
 *
 * Devuelve `null` cuando no hay producto elegido: no hay nada honesto que
 * decir sobre el stock de nada.
 */
export function textoDeStock(producto: Product | undefined): string | null {
  if (!producto) return null;

  const unidad = etiquetaDeUnidad(
    producto.unidad,
    producto.stock,
  ).toLowerCase();

  switch (producto.estado) {
    case "sin-stock":
      return "Sin stock disponible.";
    case "negativo":
      return `Stock en negativo (${producto.stock} ${unidad}): falta cargar una entrada.`;
    case "bajo":
      return `Stock bajo: quedan ${producto.stock} ${unidad}.`;
    default:
      return `Stock disponible: ${producto.stock} ${unidad}.`;
  }
}
