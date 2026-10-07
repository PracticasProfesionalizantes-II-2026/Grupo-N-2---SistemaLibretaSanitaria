"use server";

import "server-only";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { signIn as authSignIn } from "@/auth";
import { getPostSignupRoute, toAppRole } from "@/config/roles";
import {
  accountSchema,
  vetInfoSchema,
} from "@/features/auth/schemas/auth-schemas";
import {
  GENERIC_ERROR,
  notConfigured,
  type ActionResult,
} from "@/features/auth/lib/auth-result";
import { createUser, getUserByEmail, type AuthUser } from "@/lib/auth/admin";
import {
  getDb,
  isDatabaseConfigured,
  withServiceRole,
  type Tx,
} from "@/lib/db";
import { vetInstitutions, vetProfessionals } from "@/lib/db/schema/schema";

/**
 * Alta de cuentas: dueño y veterinaria.
 *
 * La cuenta queda confirmada al crearse (no hay paso de verificación por
 * email) y la sesión se abre en el mismo paso. Todo lo que se crea en la base
 * va en **una sola transacción**: si falla la veterinaria o el municipio, la
 * cuenta tampoco queda, sin necesidad de un rollback a mano.
 *
 * Corre como `service_role` (ver `withServiceRole`): los triggers que
 * protegen matrícula, validación y rol de institución solo dejan pasar ese
 * rol, igual que con el cliente admin anterior.
 */
type AccountInput = {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  confirmPassword: string;
  aceptaTerminos: true;
};

type SignUpResult = ActionResult<{ redirectTo: string }>;

const EMAIL_TAKEN = {
  success: false as const,
  error: "Ese email ya está registrado",
  field: "email" as const,
};

class FormError extends Error {
  constructor(public result: Exclude<SignUpResult, { success: true }>) {
    super(result.error);
  }
}

/** Código SQLSTATE, venga directo de `pg` o envuelto por Drizzle. */
function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

function createAccountUser(
  tx: Tx,
  account: AccountInput,
  role: "owner" | "vet",
) {
  // El trigger `handle_new_user` lee estos datos para armar el perfil y fija
  // el rol real en `raw_app_meta_data`.
  return createUser(
    {
      email: account.email,
      password: account.password,
      userMetadata: {
        role,
        first_name: account.nombre,
        last_name: account.apellido,
      },
    },
    tx,
  );
}

async function register(
  account: AccountInput,
  create: (tx: Tx) => Promise<AuthUser>,
): Promise<SignUpResult> {
  if (await getUserByEmail(account.email)) return EMAIL_TAKEN;

  let user: AuthUser;
  try {
    user = await withServiceRole(create);
  } catch (error) {
    if (error instanceof FormError) return error.result;
    // 23505 en auth.users: alguien registró el email entre el chequeo y acá.
    if (pgCode(error) === "23505") return EMAIL_TAKEN;
    console.error("signUp failed", error);
    return { success: false, error: GENERIC_ERROR };
  }

  const role = toAppRole(user.app_metadata.role as string | undefined);

  await authSignIn("credentials", {
    email: account.email,
    password: account.password,
    redirect: false,
  });
  revalidatePath("/", "layout");

  return { success: true, redirectTo: getPostSignupRoute(role) };
}

export async function signUp(input: AccountInput): Promise<SignUpResult> {
  if (!isDatabaseConfigured()) return notConfigured();

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Revisá los datos del formulario." };
  }

  return register(parsed.data, (tx) =>
    createAccountUser(tx, parsed.data, "owner"),
  );
}

export async function signUpVet(input: {
  account: AccountInput;
  vet: {
    nombreVeterinaria: string;
    direccion: string;
    matricula: string;
    telefono: string;
    sitioWeb?: string;
  };
}): Promise<SignUpResult> {
  if (!isDatabaseConfigured()) return notConfigured();

  const account = accountSchema.safeParse(input.account);
  const vet = vetInfoSchema.safeParse(input.vet);

  if (!account.success || !vet.success) {
    return { success: false, error: "Revisá los datos del formulario." };
  }

  const matriculaTomada = {
    success: false as const,
    error: "Esa matrícula ya está registrada",
    field: "matricula" as const,
  };

  // La restricción UNIQUE de la base es la que manda; esto solo evita llegar
  // al error después de haber hecho todo lo demás.
  const [taken] = await getDb()
    .select({ id: vetProfessionals.id })
    .from(vetProfessionals)
    .where(eq(vetProfessionals.licenseNumber, vet.data.matricula));
  if (taken) return matriculaTomada;

  return register(account.data, async (tx) => {
    const user = await createAccountUser(tx, account.data, "vet");

    const [institution] = await tx
      .insert(vetInstitutions)
      .values({
        name: vet.data.nombreVeterinaria,
        address: vet.data.direccion,
        phone: vet.data.telefono,
        website: vet.data.sitioWeb || null,
      })
      .returning({ id: vetInstitutions.id });

    try {
      await tx.insert(vetProfessionals).values({
        profileId: user.id,
        institutionId: institution.id,
        licenseNumber: vet.data.matricula,
        roleInInstitution: "owner",
      });
    } catch (error) {
      if (pgCode(error) === "23505") throw new FormError(matriculaTomada);
      throw error;
    }

    return user;
  });
}
