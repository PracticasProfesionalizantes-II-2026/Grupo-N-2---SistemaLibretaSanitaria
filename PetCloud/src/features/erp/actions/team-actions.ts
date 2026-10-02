"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ERP_BASE } from "@/config/erp-nav";
import type { ActionResult } from "@/features/erp/actions/stock-actions";
import { requireErpOwner } from "@/features/erp/lib/erp-session";
import {
  teamModuleGrantSchema,
  type TeamModuleGrantValues,
} from "@/features/erp/schemas/team-schemas";
import { erpWrite } from "@/features/erp/lib/erp-sql";
import { insertInto, query, updateSet } from "@/lib/db";
import type { Database } from "@/types/supabase";

/**
 * Escrituras del módulo de Equipo (migración 111).
 *
 * `requireErpOwner()` primero, no `requireErp()`: delegar un módulo es una
 * acción exclusiva del titular (`erp-team` spec, "Only the owner can
 * delegate ERP permissions"), y ese chequeo del lado de la aplicación da el
 * mismo mensaje explicado antes de llegar a las políticas
 * `module_grants_insert`/`module_grants_update` (104), que ya lo exigen del
 * lado de la base — mismo criterio que `requireErp()` en el resto del ERP.
 *
 * Ninguna de las dos hace un `INSERT` a ciegas: `uq_module_grants` (104) es
 * `UNIQUE(institution_id, professional_id, module)` y la fila de un permiso
 * revocado sigue existiendo (111 no borra nada), así que otorgar y
 * re-otorgar después de revocar tienen que resolver contra la fila que ya
 * está, no chocar con el índice único.
 */

const ERROR_GENERICO = "No pudimos guardar el cambio. Probá de nuevo.";
const DATOS_INVALIDOS =
  "Revisá los datos: falta algo o el formato no es válido.";

/**
 * El tipo generado marca opcionales `revoked_at`, `revoked_by` y
 * `updated_at`, porque tienen default o los escribe un trigger — pero un
 * INSERT acá es siempre un permiso nuevo y vigente: revocar y re-otorgar son
 * `UPDATE` (111), nunca un segundo INSERT, que chocaría con
 * `uq_module_grants` (104). El `Omit` restituye esa garantía, la misma que
 * llevaba `lib/erp-db.ts` antes de borrarse.
 */
type ModuleGrantInsert = Omit<
  Database["erp"]["Tables"]["module_grants"]["Insert"],
  "revoked_at" | "revoked_by" | "created_at" | "updated_at"
>;

/**
 * `revoked_at`/`revoked_by` sí entran en el UPDATE — son justamente el
 * mecanismo de revocación. Lo que no entra es `institution_id`: mover un
 * permiso de institución no es una operación que exista.
 */
type ModuleGrantUpdate = Omit<
  Database["erp"]["Tables"]["module_grants"]["Update"],
  "id" | "institution_id" | "created_at" | "updated_at"
>;

function revalidarEquipo() {
  revalidatePath(`${ERP_BASE}/equipo`);
  revalidatePath(ERP_BASE);
}

export async function grantModule(
  input: TeamModuleGrantValues,
): Promise<ActionResult> {
  const vet = await requireErpOwner();

  const parsed = teamModuleGrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const { profesionalId, modulo } = parsed.data;

  // Re-otorga el permiso si estaba revocado, o lo crea.
  const error = await erpWrite(vet.usuario.id, async (tx) => {
    const [existente] = await query<{ id: string; revoked_at: string | null }>(
      tx,
      sql`select id, revoked_at from erp.module_grants
           where institution_id = ${vet.institucionId}
             and professional_id = ${profesionalId} and module = ${modulo}`,
    );

    if (existente?.revoked_at === null) return;

    if (existente) {
      await tx.execute(
        sql`${updateSet("erp.module_grants", {
          revoked_at: null,
          revoked_by: null,
          granted_by: vet.profesionalId,
        } satisfies ModuleGrantUpdate)} where id = ${existente.id}`,
      );
      return;
    }

    await tx.execute(
      insertInto("erp.module_grants", {
        institution_id: vet.institucionId,
        professional_id: profesionalId,
        module: modulo,
        granted_by: vet.profesionalId,
      } satisfies ModuleGrantInsert),
    );
  });

  if (error) {
    console.error("grantModule", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarEquipo();
  return { ok: true };
}

export async function revokeModule(
  input: TeamModuleGrantValues,
): Promise<ActionResult> {
  const vet = await requireErpOwner();

  const parsed = teamModuleGrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DATOS_INVALIDOS };

  const { profesionalId, modulo } = parsed.data;

  const error = await erpWrite(vet.usuario.id, (tx) =>
    tx.execute(
      sql`${updateSet("erp.module_grants", {
        revoked_at: new Date().toISOString(),
        revoked_by: vet.profesionalId,
      } satisfies ModuleGrantUpdate)}
          where institution_id = ${vet.institucionId}
            and professional_id = ${profesionalId} and module = ${modulo}
            and revoked_at is null`,
    ),
  );

  if (error) {
    console.error("revokeModule", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  revalidarEquipo();
  return { ok: true };
}
