import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { type UserRole, toAppRole } from "@/config/roles";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { profiles, usersInAuth } from "@/lib/db/schema/schema";

/**
 * Quién está usando el sistema, del lado del servidor.
 *
 * Envuelto en `cache()` de React: en una misma pantalla lo preguntan el layout,
 * el encabezado y cada consulta, y sin esto serían cinco consultas a la base
 * por página. El caché dura lo que dura el request.
 *
 * La cookie de Auth.js solo aporta el id (firmado). Email y rol se leen de
 * `auth.users` en cada request: si la cuenta se borró o cambió de rol, manda
 * la base y no un JWT viejo.
 */
export const getCurrentUser = cache(async () => {
  if (!isDatabaseConfigured()) return null;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [row] = await getDb()
    .select({
      id: usersInAuth.id,
      email: usersInAuth.email,
      appMeta: usersInAuth.rawAppMetaData,
      userMeta: usersInAuth.rawUserMetaData,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      phone: profiles.phone,
      address: profiles.address,
      avatarUrl: profiles.avatarUrl,
      municipalityId: profiles.municipalityId,
    })
    .from(usersInAuth)
    .leftJoin(profiles, eq(profiles.id, usersInAuth.id))
    .where(eq(usersInAuth.id, userId));

  if (!row) return null;

  const user = {
    id: row.id,
    email: row.email,
    app_metadata: row.appMeta as { role?: string },
    user_metadata: row.userMeta as Record<string, unknown>,
  };
  // El nombre vive en `profiles`, que es la fila editable; `user_metadata` solo
  // guarda lo que se cargó al registrarse. Si el perfil todavía no está, se usa
  // el metadata como respaldo.
  const profile =
    row.firstName === null && row.lastName === null
      ? null
      : {
          first_name: row.firstName,
          last_name: row.lastName,
          phone: row.phone,
          address: row.address,
          avatar_url: row.avatarUrl,
          municipality_id: row.municipalityId,
        };

  return {
    id: user.id,
    email: user.email ?? "",
    role: toAppRole(user.app_metadata?.role) as UserRole,
    nombre:
      profile?.first_name || (user.user_metadata?.first_name as string) || "",
    apellido:
      profile?.last_name || (user.user_metadata?.last_name as string) || "",
    telefono: profile?.phone ?? "",
    direccion: profile?.address ?? "",
    avatarUrl: profile?.avatar_url ?? null,
    // Desde la 021 la columna es una FK real a `municipalities.id`. Ya no se
    // asume ningún municipio por defecto: adivinar acá era exactamente lo que
    // la migración evita en la base (nunca se adivina un mapeo), y hacerlo del
    // lado de la app deshacía esa garantía. `null` significa "sin jurisdicción
    // declarada todavía" y las pantallas que dependen de esto deben manejarlo.
    municipioId: profile?.municipality_id ?? null,
  };
});

/**
 * Para las pantallas y acciones que no tienen sentido sin sesión.
 *
 * El proxy ya filtra por sesión antes de llegar acá, pero eso es un chequeo
 * optimista que corre sobre la cookie: esta es la comprobación que de verdad
 * decide, y sin ella una Server Action invocada directamente no tendría ninguna.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return user;
}
