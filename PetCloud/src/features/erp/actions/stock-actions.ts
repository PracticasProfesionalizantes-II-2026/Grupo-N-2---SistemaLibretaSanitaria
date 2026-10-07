"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ERP_BASE } from "@/config/erp-nav";
import { requireErp } from "@/features/erp/lib/erp-session";
import { normalizeGtin } from "@/features/erp/lib/gtin";
import {
  kindDelMotivo,
  signoDelMotivo,
} from "@/features/erp/lib/movement-reason";
import {
  productSchema,
  stockMovementSchema,
  type ProductValues,
  type StockMovementValues,
} from "@/features/erp/schemas/stock-schemas";
import { erpWrite } from "@/features/erp/lib/erp-sql";
import { insertInto, query, rpc, updateSet } from "@/lib/db";
import type { Database } from "@/types/database";

/**
 * Escrituras del módulo de stock (migración 101).
 *
 * Las cinco pasan por `requireErp()` antes de tocar nada. No es redundante con
 * RLS: la política devuelve un error de PostgreSQL y esto devuelve un mensaje
 * de PetCloud. Mismo criterio que `vet/actions/appointment-actions.ts`.
 *
 * Ninguna usa `createAdminClient()`. Todo lo que se escribe acá lo puede
 * escribir la sesión del profesional por política — y que así sea es
 * deliberado: el día que algo del ERP necesite saltear RLS, va a tener que
 * justificarse en un comentario, no colarse por costumbre.
 */

export type ActionResult =
  { ok: true } | { ok: false; error: string; campo?: string };

/**
 * Los tipos generados son más permisivos que la base.
 *
 * el generador de tipos marca opcional toda columna que tenga default o que
 * escriba un trigger — no distingue "podés omitirla" de "no la escribas vos".
 * `stock` lo lleva el trigger de la 101 sumando el libro de movimientos, y
 * `created_at`/`updated_at` los ponen el default y el trigger de fecha: dejar
 * que la aplicación los mande sería exactamente la trampa del "número que se
 * edita en vez de sumarse" que la 101 explica.
 *
 * Por eso el `Omit`: escribir `stock` desde acá vuelve a ser un error de
 * compilación y no una regla que alguien tiene que recordar. Es la misma
 * barrera que llevaba `lib/erp-db.ts` antes de borrarse, restituida sobre el
 * tipo generado.
 */
type ProductInsert = Omit<
  Database["erp"]["Tables"]["products"]["Insert"],
  "stock" | "created_at" | "updated_at"
>;

type BarcodeInsert = Omit<
  Database["erp"]["Tables"]["product_barcodes"]["Insert"],
  "created_at"
>;

/**
 * Qué pasó con el aporte al catálogo compartido al guardar (migración 116,
 * `erp-catalogo-compartido` fase 4). `skipped` cubre tanto "no había código"
 * como "el código ya estaba en el catálogo (hit) y no hacía falta aportar
 * nada" — el modal solo pide `catalogoTipo` cuando detectó un miss, así que
 * su ausencia es la señal de que no corresponde llamar a `catalog_add`.
 */
type CatalogoOutcome = "added" | "existing" | "skipped" | "failed";

export type CreateProductResult =
  | { ok: true; catalogo: CatalogoOutcome }
  | { ok: false; error: string; campo?: string };

/**
 * Además de `stock`, el UPDATE deja fuera `id` e `institution_id`: es la
 * segunda barrera contra mover un producto de institución — la primera es el
 * `WITH CHECK` de la política `products_update` (101).
 */
type ProductUpdate = Omit<
  Database["erp"]["Tables"]["products"]["Update"],
  "id" | "institution_id" | "stock" | "created_at" | "updated_at"
>;

/**
 * La anulación de un movimiento no se escribe a mano: la hace
 * `erp.void_movement()` (101), que marca el original y crea el contrasiento
 * en la misma transacción. `voided_at`/`voided_by` quedan fuera del INSERT
 * para que ese camino sea el único.
 */
type StockMovementInsert = Omit<
  Database["erp"]["Tables"]["stock_movements"]["Insert"],
  "voided_at" | "voided_by" | "created_at"
>;

const ERROR_GENERICO = "No pudimos guardar el cambio. Probá de nuevo.";
const DATOS_INVALIDOS =
  "Revisá los datos: falta algo o el formato no es válido.";

const CENTAVOS = 100;

/** Pesos → centavos, en un solo lugar. Redondear en cada llamada es cómo se cuelan los errores de un centavo. */
const aCentavos = (pesos: number) => Math.round(pesos * CENTAVOS);

function revalidarStock(productId?: string) {
  revalidatePath(`${ERP_BASE}/stock`);
  if (productId) revalidatePath(`${ERP_BASE}/stock/${productId}`);
  // El tablero del ERP muestra el aviso de reposición.
  revalidatePath(ERP_BASE);
}

/**
 * `23505` es la violación de índice único: acá solo puede venir del SKU
 * repetido dentro de la institución (`idx_erp_products_sku`). Se traduce al
 * campo que la persona escribió, en vez de mostrarle el texto de PostgreSQL.
 */
function esSkuDuplicado(codigo?: string) {
  return codigo === "23505";
}

/**
 * `ERP01` es el SQLSTATE que levanta `erp.check_stock_suficiente()` (migración
 * 102) cuando una salida dejaría el stock por debajo de cero.
 *
 * El mensaje de la base ya viene escrito para que lo lea una persona —dice qué
 * producto, cuánto hay y cuánto se estaba sacando—, así que se muestra tal cual
 * en vez de reemplazarlo por un genérico que diría menos. Mismo criterio que
 * `voidMovement()` con los errores de `erp.void_movement()`.
 *
 * Se compara también contra el texto porque PostgREST no siempre propaga un
 * SQLSTATE de clase propia en `code`: si el día de mañana lo pierde, el usuario
 * tiene que seguir leyendo el motivo real y no "probá de nuevo".
 */
function esStockInsuficiente(codigo?: string, mensaje?: string) {
  return codigo === "ERP01" || Boolean(mensaje?.includes("Stock insuficiente"));
}

export async function createProduct(
  input: ProductValues,
): Promise<CreateProductResult> {
  const vet = await requireErp();

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  let producto: { id: string } | undefined;
  const error = await erpWrite(vet.usuario.id, async (tx) => {
    [producto] = await query<{ id: string }>(
      tx,
      sql`${insertInto("erp.products", {
        institution_id: vet.institucionId,
        sku: valores.sku || null,
        name: valores.nombre,
        category: valores.categoria || null,
        unit: valores.unidad,
        cost_cents: aCentavos(valores.costo),
        price_cents: aCentavos(valores.precio),
        min_stock: valores.stockMinimo,
        presentation: valores.presentacion || null,
        laboratory: valores.laboratorio || null,
        active: true,
      } satisfies ProductInsert)} returning id`,
    );
  });

  if (error) {
    if (esSkuDuplicado(error.code)) {
      return {
        ok: false,
        error: "Ya tenés un producto con ese código.",
        campo: "sku",
      };
    }

    console.error("createProduct", error);
    return { ok: false, error: ERROR_GENERICO };
  }
  if (!producto) return { ok: false, error: ERROR_GENERICO };
  const productoId = producto.id;

  const codigo = valores.codigoBarras?.trim();
  let catalogo: CatalogoOutcome = "skipped";

  if (codigo) {
    // El código local del producto — mismo camino que `addBarcode()`, pero
    // inline: ya tenemos acá el `product_id` recién creado y la sesión del
    // profesional, y esta es la única llamada que necesita las dos cosas
    // juntas antes de que el modal vuelva a abrirse.
    const errorCodigo = await erpWrite(vet.usuario.id, (tx) =>
      tx.execute(
        insertInto("erp.product_barcodes", {
          institution_id: vet.institucionId,
          product_id: productoId,
          code: codigo,
        } satisfies BarcodeInsert),
      ),
    );

    if (errorCodigo) {
      // No bloqueante: el producto ya se guardó. Un código duplicado acá es
      // el mismo caso que ya cubre `addBarcode()` y la persona puede
      // agregarlo de nuevo abriendo esta misma modal en edición.
      console.error("createProduct: código de barras", errorCodigo);
    }

    const gtin = normalizeGtin(codigo);
    if (gtin && valores.catalogoTipo) {
      // Aporta la entrada al catálogo compartido (migración 116, decisión
      // D8: "best effort, nunca bloquea"). Solo se llama cuando el modal
      // detectó un miss y pidió `catalogoTipo` — un hit no manda ese campo,
      // así que no hay nada que aportar (la entrada ya existe). Una falla
      // acá se registra y se informa como `toast.warning` no bloqueante
      // desde el modal; el alta del producto ya quedó confirmada antes de
      // este paso.
      let entrada: { created_by_institution_id: string | null } | undefined;
      const errorCatalogo = await erpWrite(vet.usuario.id, async (tx) => {
        // `p_species` NULL es legítimo: "todas las especies".
        [entrada] = await rpc<{ created_by_institution_id: string | null }>(
          tx,
          "erp.catalog_add",
          {
            p_gtin: gtin,
            p_name: valores.nombre,
            p_species: valores.catalogoEspecie || null,
            p_product_type: valores.catalogoTipo,
            p_presentation: valores.presentacion || null,
            p_laboratory: valores.laboratorio || null,
          },
        );
      });

      if (errorCatalogo) {
        console.error("catalog_add", errorCatalogo);
        catalogo = "failed";
      } else {
        // El ganador de la carrera de alta concurrente (D4) es quien queda
        // como `created_by_institution_id`; si es esta institución, la
        // entrada es efectivamente nueva. Si es otra, alguien se adelantó
        // entre el lookup y el guardado y esta llamada solo devolvió la
        // entrada existente.
        catalogo =
          entrada?.created_by_institution_id === vet.institucionId
            ? "added"
            : "existing";
      }
    }
  }

  revalidarStock();
  return { ok: true, catalogo };
}

/**
 * `institution_id` no se manda en el UPDATE, y el tipo `ProductUpdate` de
 * arriba directamente no lo tiene. Es la segunda barrera contra mover un
 * producto de institución; la primera es el `WITH CHECK` de la política
 * `products_update` (101).
 */
export async function updateProduct(
  productId: string,
  input: ProductValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      sql`${updateSet("erp.products", {
        sku: valores.sku || null,
        name: valores.nombre,
        category: valores.categoria || null,
        unit: valores.unidad,
        cost_cents: aCentavos(valores.costo),
        price_cents: aCentavos(valores.precio),
        min_stock: valores.stockMinimo,
        presentation: valores.presentacion || null,
        laboratory: valores.laboratorio || null,
      } satisfies ProductUpdate)}
          where id = ${productId} and institution_id = ${vet.institucionId}`,
    ),
  );

  if (error) {
    if (esSkuDuplicado(error.code)) {
      return {
        ok: false,
        error: "Ya tenés un producto con ese código.",
        campo: "sku",
      };
    }

    console.error("updateProduct", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarStock(productId);
  return { ok: true };
}

/**
 * Desactivar y reactivar. No hay `deleteProduct` y no lo va a haber: la tabla
 * no tiene política de DELETE (101), así que ni siquiera se puede escribir por
 * accidente. Un producto con movimientos históricos tiene que seguir
 * existiendo para que una venta de hace ocho meses se pueda explicar.
 */
export async function setProductActive(
  productId: string,
  activo: boolean,
): Promise<ActionResult> {
  const vet = await requireErp();

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      sql`${updateSet("erp.products", { active: activo } satisfies ProductUpdate)}
          where id = ${productId} and institution_id = ${vet.institucionId}`,
    ),
  );

  if (error) {
    console.error("setProductActive", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarStock(productId);
  return { ok: true };
}

/**
 * Registrar un movimiento cargado a mano.
 *
 * El formulario manda un MOTIVO; el `kind` técnico y el signo salen de él acá,
 * con el catálogo de `lib/movement-reason.ts`. Si los pusiera el componente,
 * cada formulario nuevo que escriba movimientos tendría que acordarse de la
 * regla — y alcanzaría con que uno se olvide para que el libro empiece a
 * mentir.
 *
 * El motivo se guarda además en la columna `reason` (migración 114): sin eso,
 * un vencimiento y una rotura vuelven a ser la misma "pérdida" y no hay
 * reporte posible. La base comprueba que motivo y `kind` coincidan con el
 * CHECK `stock_movements_reason_kind_coherentes`.
 */
export async function registerMovement(
  input: StockMovementValues,
): Promise<ActionResult> {
  const vet = await requireErp();

  const parsed = stockMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const valores = parsed.data;

  const signo = signoDelMotivo(valores.motivo, valores.ajusteResta);

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      insertInto("erp.stock_movements", {
        institution_id: vet.institucionId,
        product_id: valores.productoId,
        kind: kindDelMotivo(valores.motivo),
        reason: valores.motivo,
        quantity: valores.cantidad * signo,
        unit_cost_cents:
          valores.costoUnitario === undefined
            ? null
            : aCentavos(valores.costoUnitario),
        note: valores.nota || null,
        created_by: vet.profesionalId,
      } satisfies StockMovementInsert),
    ),
  );

  if (error) {
    if (esStockInsuficiente(error.code, error.message)) {
      return { ok: false, error: error.message, campo: "cantidad" };
    }

    console.error("registerMovement", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarStock(valores.productoId);
  return { ok: true };
}
