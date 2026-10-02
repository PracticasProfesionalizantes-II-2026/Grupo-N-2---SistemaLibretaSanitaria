import "server-only";

import { sql } from "drizzle-orm";

import { requireErp } from "@/features/erp/lib/erp-session";
import { limitesDiaArgentina } from "@/lib/argentina-time";
import { getDb, query, rpc, withUser } from "@/lib/db";

/**
 * Lecturas de la portada del ERP.
 *
 * Son funciones propias y no un reuso de `listSales()` o `getCashAccount()`
 * por una razón concreta: esas devuelven `[]`/`null` cuando falla la consulta,
 * y en la portada "no hay ventas" y "no se pudo leer" tienen que verse
 * distinto. Acá un error vuelve como `null` y la pantalla muestra "—".
 *
 * Todas van por el cliente de la sesión, así que RLS
 * (`erp.has_access(institution_id, módulo)`) sigue siendo la que decide.
 */

/** Módulos con permiso propio (migración 104). Clientes cuelga de `ventas`. */
export type ErpModulo = "stock" | "ventas" | "caja" | "compras";

const MODULOS: ErpModulo[] = ["stock", "ventas", "caja", "compras"];

/**
 * Qué módulos puede usar la persona, preguntándole a la misma función que
 * usa RLS. Si la consulta falla, el módulo se trata como no permitido: la
 * portada esconde un acceso de más antes que mostrar uno que no abre.
 */
export async function permisosDeModulos(): Promise<Record<ErpModulo, boolean>> {
  const session = await requireErp();

  // `erp.has_access()` lee `auth.uid()`: corre como el usuario.
  const respuestas = await withUser(session.usuario.id, (tx) =>
    Promise.all(
      MODULOS.map((modulo) =>
        rpc<{ has_access: boolean }>(tx, "erp.has_access", {
          p_institution_id: session.institucionId,
          p_module: modulo,
        }).then(
          ([fila]) => fila?.has_access === true,
          (error) => {
            console.error("permisosDeModulos", modulo, error);
            return false;
          },
        ),
      ),
    ),
  ).catch(() => MODULOS.map(() => false));

  return Object.fromEntries(
    MODULOS.map((modulo, i) => [modulo, respuestas[i]]),
  ) as Record<ErpModulo, boolean>;
}

export async function resumenVentasDeHoy(): Promise<{
  cantidad: number;
  totalPesos: number;
} | null> {
  const vet = await requireErp();

  const { inicio, fin } = limitesDiaArgentina();
  try {
    const [fila] = await query<{ cantidad: number; total: number }>(
      getDb(),
      sql`select count(*)::int as cantidad, coalesce(sum(total_cents), 0) as total
            from erp.sales
           where institution_id = ${vet.institucionId} and status = 'registered'
             and created_at >= ${inicio} and created_at < ${fin}`,
    );
    return { cantidad: fila.cantidad, totalPesos: fila.total / 100 };
  } catch (error) {
    console.error("resumenVentasDeHoy", error);
    return null;
  }
}

export async function saldoDeCaja(): Promise<number | null> {
  const vet = await requireErp();

  try {
    const [fila] = await query<{ balance_cents: number }>(
      getDb(),
      sql`select balance_cents from erp.cash_accounts
           where institution_id = ${vet.institucionId} limit 1`,
    );
    return (fila?.balance_cents ?? 0) / 100;
  } catch (error) {
    console.error("saldoDeCaja", error);
    return null;
  }
}

export async function cantidadBajoMinimo(): Promise<number | null> {
  const vet = await requireErp();

  try {
    const [fila] = await query<{ total: number }>(
      getDb(),
      sql`select count(*)::int as total from erp.products
           where institution_id = ${vet.institucionId} and active
             and stock <= min_stock`,
    );
    return fila.total;
  } catch (error) {
    console.error("cantidadBajoMinimo", error);
    return null;
  }
}
