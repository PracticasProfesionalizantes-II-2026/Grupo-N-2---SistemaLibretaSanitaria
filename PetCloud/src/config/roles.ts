import type { Database } from "@/types/supabase";

export type UserRole = "dueno" | "veterinario" | "admin";

/**
 * El enum `user_role` tal como está en la base.
 *
 * Se deriva del tipo generado en vez de escribirse a mano: `src/types/supabase.ts`
 * lo regenera `npm run db:types` y pisa el archivo entero, así que cualquier alias
 * que viviera ahí desaparecería en la primera regeneración. Derivándolo, si algún
 * día se agrega un rol a la base, TypeScript exige completar los dos mapas de
 * abajo en vez de dejar un agujero silencioso.
 */
export type UserRoleDb = Database["public"]["Enums"]["user_role"];

/**
 * A dónde entra cada rol después del login o del onboarding.
 *
 * Regla 1 del mapa de navegación: la redirección post-login es por rol, sin
 * pantalla intermedia de selección. Nadie elige a qué panel entra.
 *
 * Cada panel entra por su propia pantalla inicial.
 */
export const POST_LOGIN_ROUTE: Record<UserRole, string> = {
  dueno: "/inicio",
  veterinario: "/veterinaria/gestion",
  admin: "/admin/validaciones",
};

export function getPostLoginRoute(role: UserRole) {
  return POST_LOGIN_ROUTE[role];
}

/**
 * A dónde va cada rol recién registrado, antes de tener el resto de
 * la cuenta lista para el panel normal.
 *
 * Distinto de `getPostLoginRoute`: al dueño le falta cargar su primera
 * mascota, así que entra al onboarding en vez de a `/inicio`. Al veterinario le
 * falta que se valide la matrícula. Usado por las acciones de registro
 * (`register-actions.ts`).
 */
export function getPostSignupRoute(role: UserRole) {
  if (role === "dueno") return "/onboarding/dueno";
  if (role === "veterinario") return "/cuenta-en-revision";
  return getPostLoginRoute(role);
}

/**
 * Dos vocabularios para lo mismo, traducidos en un solo lugar.
 *
 * La base los nombra en inglés porque es el enum `user_role` de PostgreSQL y ahí
 * manda la convención del motor. La aplicación los nombra en castellano porque
 * es el idioma del producto y esos nombres se ven en las URL y en la pantalla.
 * Todo el cruce pasa por acá; en ningún otro archivo conviven los dos.
 */
const DB_TO_APP: Record<UserRoleDb, UserRole> = {
  owner: "dueno",
  vet: "veterinario",
  // El rol municipal sigue en el enum de la base pero ya no tiene panel.
  municipality: "dueno",
  admin: "admin",
};

/**
 * Un rol desconocido cae en `dueno`, el de menos privilegios: si algún día la
 * base devuelve algo que la aplicación no conoce, el peor caso es que alguien
 * vea el panel equivocado, no que entre a uno que no le toca.
 */
export const toAppRole = (role: string | null | undefined): UserRole =>
  DB_TO_APP[role as UserRoleDb] ?? "dueno";
