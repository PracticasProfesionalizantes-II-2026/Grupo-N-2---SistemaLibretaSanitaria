"use server";

import "server-only";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signIn as authSignIn, signOut as authSignOut } from "@/auth";
import { getPostLoginRoute, toAppRole } from "@/config/roles";
import { loginSchema } from "@/features/auth/schemas/auth-schemas";
import {
  GENERIC_ERROR,
  notConfigured,
  type ActionResult,
} from "@/features/auth/lib/auth-result";
import { getUserByEmail } from "@/lib/auth/admin";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { vetProfessionals } from "@/lib/db/schema/schema";

/**
 * Entrada y salida de la sesión (Auth.js, ver `src/auth.ts`).
 *
 * `signIn` devuelve `redirectTo` en vez de redirigir: el veterinario sin
 * matrícula validada entra igual, pero a la
 * pantalla que les explica en qué estado están.
 */
export async function signIn(input: {
  email: string;
  password: string;
}): Promise<ActionResult<{ redirectTo: string }>> {
  if (!isDatabaseConfigured()) return notConfigured();

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Email o contraseña incorrectos." };
  }

  try {
    await authSignIn("credentials", { ...parsed.data, redirect: false });
  } catch (error) {
    // Mismo mensaje exista o no el email: no se confirma qué cuentas existen.
    if (error instanceof AuthError) {
      return { success: false, error: "Email o contraseña incorrectos." };
    }
    console.error("signIn failed", error);
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath("/", "layout");
  return {
    success: true,
    redirectTo: await routeAfterSignIn(parsed.data.email),
  };
}

/**
 * El veterinario sin matrícula validada entra igual, pero a la pantalla que
 * le explica en qué estado está.
 */
async function routeAfterSignIn(email: string): Promise<string> {
  const user = await getUserByEmail(email);
  if (!user) return "/";

  const role = toAppRole(user.app_metadata.role as string | undefined);
  const db = getDb();

  if (role === "veterinario") {
    const [professional] = await db
      .select({ validated: vetProfessionals.licenseValidated })
      .from(vetProfessionals)
      .where(eq(vetProfessionals.profileId, user.id));
    if (professional && !professional.validated) return "/cuenta-en-revision";
  }

  return getPostLoginRoute(role);
}

async function closeSession(redirectTo: string): Promise<never> {
  revalidatePath("/", "layout");
  await authSignOut({ redirect: false });
  redirect(redirectTo);
}

export async function signOut() {
  await closeSession("/");
}

/**
 * La salida de `/cuenta-incompleta`. Va a `/login` y no al inicio porque quien
 * llegó ahí quiere volver a probar con otra cuenta.
 */
export async function signOutToLogin() {
  await closeSession("/login");
}
