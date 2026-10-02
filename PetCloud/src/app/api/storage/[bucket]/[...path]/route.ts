import { NextResponse } from "next/server";

import { getCurrentUser } from "@/features/auth/lib/current-user";
import { getStorage, PUBLIC_BUCKETS } from "@/lib/storage";

/**
 * Serves stored files. Public buckets (pet and profile photos) are open, like
 * they were in Supabase; the rest require a session.
 *
 * Per-object authorization (the storage.objects RLS policies) is not enforced
 * yet: any signed-in user can read a private file if they know its path.
 * Paths contain random UUIDs, which limits guessing. See docs/arquitectura.md.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/storage/[bucket]/[...path]">,
) {
  const { bucket, path } = await ctx.params;
  const filePath = path.join("/");

  if (!PUBLIC_BUCKETS.has(bucket) && !(await getCurrentUser())) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  let file;
  try {
    file = await getStorage().download(bucket, filePath);
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }
  if (!file) return new NextResponse("No encontrado", { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": PUBLIC_BUCKETS.has(bucket)
        ? "public, max-age=3600"
        : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Uploaded SVG/HTML must never run as a page of this origin.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
