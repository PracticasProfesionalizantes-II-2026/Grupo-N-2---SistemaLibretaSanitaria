"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { ADMIN_BASE } from "@/config/admin-nav";
import type { ActionResult } from "@/features/admin/lib/action-result";
import { requireAdmin } from "@/features/admin/lib/admin-session";
import { licenseReviewSchema } from "@/features/admin/schemas/admin-schemas";
import { dbError, rpc, withUser } from "@/lib/db";

/**
 * Resolución de solicitudes de matrícula (`/admin/validaciones`).
 *
 * Wrapper fino sobre `admin_set_vet_license` (SECURITY DEFINER): el chequeo
 * `is_platform_admin()`, el sello de revisión y la auditoría viven en la RPC.
 * Corre con `withUser` para que `auth.uid()` sea el administrador.
 */

const GENERIC_ERROR = "No pudimos resolver la solicitud. Probá de nuevo.";

function traducirError(error: unknown): string {
  const { message } = dbError(error);
  const CONOCIDOS = ["Solo un administrador de plataforma", "El profesional"];
  return CONOCIDOS.some((m) => message.includes(m)) ? message : GENERIC_ERROR;
}

async function resolver(
  professionalId: string,
  validated: boolean,
  nota?: string,
): Promise<ActionResult> {
  const session = await requireAdmin();

  const parsed = licenseReviewSchema.safeParse({
    professionalId,
    validated,
    nota,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  try {
    await withUser(session.usuario.id, (tx) =>
      rpc(tx, "admin_set_vet_license", {
        p_professional_id: parsed.data.professionalId,
        p_validated: parsed.data.validated,
        p_note: parsed.data.nota || null,
      }),
    );
  } catch (error) {
    return { success: false, error: traducirError(error) };
  }

  revalidatePath(`${ADMIN_BASE}/validaciones`);
  return { success: true };
}

/** Habilita la matrícula: a partir de acá el profesional puede firmar. */
export async function validateVetLicense(
  professionalId: string,
  nota?: string,
): Promise<ActionResult> {
  return resolver(professionalId, true, nota);
}

/** Rechaza la solicitud. La nota es obligatoria (la exige el schema). */
export async function rejectVetLicense(
  professionalId: string,
  nota: string,
): Promise<ActionResult> {
  return resolver(professionalId, false, nota);
}
