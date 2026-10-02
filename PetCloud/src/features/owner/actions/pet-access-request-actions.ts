"use server";

import "server-only";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/features/auth/lib/current-user";
import type { ActionResult } from "@/features/owner/actions/pets-actions";
import { getDb, query, rpc, withUser, type FnRow } from "@/lib/db";
import type { Database } from "@/types/supabase";

/**
 * Access requests between people who share a home address (migration 073).
 *
 * Thin wrappers over the `SECURITY DEFINER` RPCs: address matching, ownership
 * and state checks live in the database. None of these actions accepts an
 * address — the RPCs read the caller's own `profiles.address_normalized`, so
 * the requester cannot probe other homes.
 */

type SharePermission = Database["public"]["Enums"]["share_permission"];

export type PendingAccessRequest = {
  id: string;
  createdAt: string;
  requesterNombre: string;
};

const GENERIC_ERROR = "No pudimos procesar la solicitud. Probá de nuevo.";

/** How many pets are registered by other owners at the caller's address. */
export async function checkMatchingPetsAction(): Promise<
  ActionResult<{ count: number }>
> {
  const user = await requireUser();

  let data: unknown;
  try {
    const [fila] = await withUser(user.id, (tx) =>
      rpc<{ check_matching_pets_by_address: unknown }>(
        tx,
        "check_matching_pets_by_address",
      ),
    );
    data = fila?.check_matching_pets_by_address;
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { success: false, error: GENERIC_ERROR };
  }

  const count = Number(
    (data as { matching_pets_count?: unknown }).matching_pets_count ?? 0,
  );

  return { success: true, count: Number.isFinite(count) ? count : 0 };
}

/**
 * Sends a pending request to every owner at the caller's address and notifies
 * each of them.
 *
 * The RPC returns the `target_owner_id` of the rows this call inserted
 * (migration 074), so owners who already had a pending request are not
 * notified twice.
 *
 * `notifications` has no INSERT policy for `authenticated` (migration 002),
 * so the insert uses the service key — same path as `acceptPetShareInvite`.
 * A failed notification does not undo the request: it is logged and reported
 * back as `notified: false`, so the UI does not claim the owners were told.
 */
export async function createPetAccessRequestAction(): Promise<
  ActionResult<{ created: number; notified: boolean }>
> {
  const user = await requireUser();

  let targets: FnRow<"create_pet_access_request_by_address">[];
  try {
    targets = await withUser(user.id, (tx) =>
      rpc<FnRow<"create_pet_access_request_by_address">>(
        tx,
        "create_pet_access_request_by_address",
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  // Sin notificaciones: el dueño ve la solicitud pendiente en su perfil.
  revalidatePath("/perfil");

  return { success: true, created: targets.length, notified: false };
}

/**
 * Pending requests received by the current user, with the requester's name.
 *
 * The request rows are read with the user's session, so RLS guarantees they
 * belong to this owner. `profiles` RLS does not let an owner read a stranger's
 * profile, so the names are read with the service key — restricted to the
 * requester ids returned by that RLS-checked query, and only first and last
 * name. The requester's email is never exposed.
 */
export async function getPendingAccessRequestsAction(): Promise<
  ActionResult<{ requests: PendingAccessRequest[] }>
> {
  const user = await requireUser();

  const rows = await query<{
    id: string;
    created_at: string;
    requester_nombre: string | null;
  }>(
    getDb(),
    sql`select r.id, r.created_at,
               nullif(trim(p.first_name || ' ' || p.last_name), '') as requester_nombre
          from pet_access_requests r
          left join profiles p on p.id = r.requester_id
         where r.target_owner_id = ${user.id} and r.status = 'pending'
         order by r.created_at desc`,
  );

  return {
    success: true,
    requests: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      requesterNombre: row.requester_nombre || "Usuario sin nombre",
    })),
  };
}

/**
 * Accepts or declines a received request. The RPC checks that the caller is
 * the target owner and that the request is still pending, and never
 * downgrades an existing higher permission.
 */
export async function respondPetAccessRequestAction({
  requestId,
  accept,
  permission = "view",
}: {
  requestId: string;
  accept: boolean;
  permission?: SharePermission;
}): Promise<ActionResult> {
  const user = await requireUser();

  let responded: unknown;
  try {
    const [fila] = await withUser(user.id, (tx) =>
      rpc<{ respond_pet_access_request: unknown }>(
        tx,
        "respond_pet_access_request",
        {
          p_request_id: requestId,
          p_accept: accept,
          p_permission: permission,
        },
      ),
    );
    responded = fila?.respond_pet_access_request;
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  if (!responded) return { success: false, error: GENERIC_ERROR };

  revalidatePath("/perfil");
  if (accept) {
    revalidatePath("/mis-mascotas");
    revalidatePath("/inicio");
  }

  return { success: true };
}
