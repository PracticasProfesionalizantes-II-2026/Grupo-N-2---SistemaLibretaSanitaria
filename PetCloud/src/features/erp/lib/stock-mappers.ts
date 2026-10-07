import type { Product, ProductUnit, StockStatus } from "@/types/erp";
import type { Database } from "@/types/database";

type ProductRow = Database["erp"]["Tables"]["products"]["Row"];

/**
 * Exactamente las columnas que pide `COLUMNAS_PRODUCTO` en `data/stock.ts`, ni
 * una más.
 *
 * No es `ProductRow` entera a propósito: el cliente tipado anterior estrecha
 * el resultado a la proyección, así que pedir la fila completa acá haría que
 * `.map(toProduct)` no compile. Y está bien que sea así — si mañana el mapper
 * necesita `institution_id`, el error de compilación aparece en el `select`
 * que hay que ampliar, no en producción con un `undefined`.
 */
export type ProductCardRow = Pick<
  ProductRow,
  | "id"
  | "sku"
  | "name"
  | "category"
  | "unit"
  | "cost_cents"
  | "price_cents"
  | "min_stock"
  | "stock"
  | "active"
  | "presentation"
  | "laboratory"
>;

/**
 * De fila de base a modelo de vista.
 *
 * Vive en `lib/` y no en `data/` porque no toca la base: es la regla de capas
 * del proyecto (`src/features/README.md`) y tiene una consecuencia práctica —
 * `data/` empieza con `server-only`, así que un test que importara de ahí
 * fallaría al cargar. Acá se prueba sin levantar nada.
 */

const CENTAVOS = 100;

/**
 * El semáforo de reposición.
 *
 * El orden de los casos importa y no es intercambiable:
 *
 *   · `negativo` va primero porque menos-que-cero también es
 *     menor-o-igual-que-el-mínimo, y si se evaluara después nunca se
 *     alcanzaría.
 *   · `sin-stock` se separa de `bajo` porque cero es un caso distinto de
 *     "queda poco": no se puede vender nada.
 *   · `negativo` se separa de `sin-stock` porque no significa que se acabó,
 *     significa que **falta cargar una entrada**. La política de INSERT de
 *     `stock_movements` (migración 101) permite salidas sin entrada previa a
 *     propósito, y esta es la señal visible de eso.
 *
 * Con `minimo = 0` —el default— un producto con stock 1 da `ok`: el aviso de
 * reponer solo aparece si alguien configuró un mínimo, o si llegó a cero.
 */
export function estadoDeStock(stock: number, minimo: number): StockStatus {
  if (stock < 0) return "negativo";
  if (stock === 0) return "sin-stock";
  if (stock <= minimo) return "bajo";
  return "ok";
}

/**
 * `Number(...)` sobre `stock` y `min_stock` no es decorativo: PostgREST
 * serializa `NUMERIC` como **string** para no perder precisión en el JSON. Sin
 * la conversión, `stock <= minimo` compararía cadenas y `"10" <= "9"` daría
 * verdadero.
 *
 * `fila.unit` llega como `string` y no como `ProductUnit`: el CHECK de
 * `erp.products.unit` (101) restringe los valores en la base, pero un CHECK no
 * es un tipo enumerado y el generador de tipos no tiene de dónde sacar la
 * unión — solo los `ENUM` de verdad del schema `public` la conservan. La
 * unión vive en `types/erp.ts` y el estrechamiento se hace acá, en el único
 * punto por donde la fila cruza a modelo de vista. Mismo criterio que
 * `municipality-mappers.ts` con `rabies_status`.
 */
export function toProduct(fila: ProductCardRow): Product {
  const stock = Number(fila.stock);
  const stockMinimo = Number(fila.min_stock);

  return {
    id: fila.id,
    sku: fila.sku,
    nombre: fila.name,
    categoria: fila.category,
    unidad: fila.unit as ProductUnit,
    costo: fila.cost_cents / CENTAVOS,
    precio: fila.price_cents / CENTAVOS,
    stock,
    stockMinimo,
    estado: estadoDeStock(stock, stockMinimo),
    activo: fila.active,
    presentacion: fila.presentation,
    laboratorio: fila.laboratory,
  };
}
