import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/features/auth/lib/current-user";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema/schema";

/**
 * Quién está usando el backoffice, con su rol confirmado contra la base.
 *
 * A diferencia de `getCurrentUser()` (que resuelve el rol desde
 * `auth.users.raw_app_meta_data`, sincronizado por el trigger
 * `sync_role_to_auth` de la 001), acá se lee `profiles.role` directo: es el mismo valor
 * que chequea `is_platform_admin()` (migración 039) del lado de la RLS, y
 * esta pantalla escribe dinero — conviene que el guard de la aplicación mire
 * exactamente lo mismo que mira la base, sin depender del espejo en
 * `auth.users`.
 *
 * Envuelto en `cache()` de React, mismo criterio que `getVetSession()` y
 * `getMunicipalitySession()`: si la página y la Server Action lo preguntan
 * en el mismo request, es un solo viaje.
 */
const getAdminSession = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const [data] = await getDb()
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id));

  return { usuario: user, rol: data?.role ?? null };
});

export type AdminSession = NonNullable<
  Awaited<ReturnType<typeof getAdminSession>>
>;

/**
 * Para las pantallas y acciones del backoffice de precios.
 *
 * Nadie autenticado sin sesión llega hasta acá por error de rol: el proxy ya
 * manda a cada quien a su propio panel. Por eso, sin sesión, redirige a
 * `/login` (mismo criterio que `requireVet()`/`requireMunicipality()`); con
 * sesión pero sin rol `admin`, en cambio, es un bypass de la UI —
 * `/admin/*` ya está oculto para cualquier otro rol— así que corta con una
 * excepción, mismo criterio que `requireMunicipalityRole()`.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  if (session.rol !== "admin") {
    throw new Error(
      `requireAdmin: se necesita rol "admin" y la sesión tiene "${session.rol ?? "desconocido"}".`,
    );
  }

  return session;
}
