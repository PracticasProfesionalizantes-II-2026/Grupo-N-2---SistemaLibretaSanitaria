import "server-only";

import { sql } from "drizzle-orm";

import { requireErp } from "@/features/erp/lib/erp-session";
import { toProduct } from "@/features/erp/lib/stock-mappers";
import { getDb, query } from "@/lib/db";
import type { Product } from "@/types/erp";

/**
 * Lecturas del módulo de stock (migración 101).
 *
 * `requireErp()` en cada función, no solo RLS: las políticas ya filtran con
 * `erp.has_access(institution_id)`, pero repetir el gate acá corta con un
 * redirect a la pantalla de facturación en vez de devolver una lista vacía sin
 * explicar por qué. Mismo criterio que `vet/data/appointments.ts`.
 *
 * Ninguna consulta usa `createAdminClient()`: todo lo que se lee es
 * exactamente lo que la sesión del profesional ya puede ver por política.
 */

/**
 * Las columnas van enumeradas y no `select("*")`.
 *
 * No es estilo: traer columnas que el mapper descarta es tráfico y memoria
 * desperdiciados. Además, el día que esta
 * tabla sume una columna sensible, no se filtra sola a todas las pantallas que
 * ya existen.
 */
const COLUMNAS_PRODUCTO = sql.raw(
  "id, sku, name, category, unit, cost_cents, price_cents, min_stock, stock, active, presentation, laboratory",
);

/**
 * El catálogo de la institución.
 *
 * Trae los inactivos también: la pantalla los filtra por defecto pero tiene que
 * poder mostrarlos para reactivar uno. Un catálogo de veterinaria son decenas
 * o cientos de filas, no miles — paginar acá sería resolver un problema que
 * este módulo no tiene.
 */
export async function listProducts(): Promise<Product[]> {
  const vet = await requireErp();

  const data = await query<Parameters<typeof toProduct>[0]>(
    getDb(),
    sql`select ${COLUMNAS_PRODUCTO} from erp.products
         where institution_id = ${vet.institucionId} order by name`,
  ).catch((error) => {
    console.error("listProducts", error);
    return [];
  });

  return data.map(toProduct);
}
