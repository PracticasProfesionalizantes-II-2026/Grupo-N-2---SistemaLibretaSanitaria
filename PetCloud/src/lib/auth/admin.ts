import "server-only";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";

import { getDb, type Db, type Tx } from "@/lib/db";
import { usersInAuth } from "@/lib/db/schema/schema";

/**
 * Replacement for `supabase.auth.admin.*` over the `auth.users` table that
 * db/shims/000_supabase_compat.sql creates. The triggers from the migrations
 * (handle_new_user, sync_role_to_auth...) still fire on these writes, so the
 * profile row and `raw_app_meta_data.role` keep being derived in the database.
 *
 * Shapes mimic Supabase's `User` (snake_case) so callers port with few changes.
 */

type Executor = Db | Tx;
type Meta = Record<string, unknown>;

export type AuthUser = {
  id: string;
  email: string | null;
  app_metadata: Meta;
  user_metadata: Meta;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  created_at: string;
};

/** Same cost Supabase (GoTrue) used, so old and new hashes are equivalent. */
const BCRYPT_ROUNDS = 10;

const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function toAuthUser(row: typeof usersInAuth.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    app_metadata: (row.rawAppMetaData ?? {}) as Meta,
    user_metadata: (row.rawUserMetaData ?? {}) as Meta,
    email_confirmed_at: row.emailConfirmedAt,
    last_sign_in_at: row.lastSignInAt,
    banned_until: row.bannedUntil,
    created_at: row.createdAt,
  };
}

/** Users are created already confirmed: there is no email confirmation step. */
export async function createUser(
  input: {
    email: string;
    password: string;
    userMetadata?: Meta;
    appMetadata?: Meta;
  },
  db: Executor = getDb(),
): Promise<AuthUser> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(usersInAuth)
    .values({
      email: normalizeEmail(input.email),
      encryptedPassword: await hashPassword(input.password),
      emailConfirmedAt: now,
      confirmedAt: now,
      rawUserMetaData: input.userMetadata ?? {},
      rawAppMetaData: { provider: "email", ...input.appMetadata },
    })
    .returning();

  // The AFTER INSERT trigger rewrote raw_app_meta_data (role); re-read it.
  return (await getUserById(row.id, db)) ?? toAuthUser(row);
}

export async function getUserById(
  id: string,
  db: Executor = getDb(),
): Promise<AuthUser | null> {
  const [row] = await db
    .select()
    .from(usersInAuth)
    .where(eq(usersInAuth.id, id));
  return row ? toAuthUser(row) : null;
}

export async function getUserByEmail(
  email: string,
  db: Executor = getDb(),
): Promise<AuthUser | null> {
  const [row] = await db
    .select()
    .from(usersInAuth)
    .where(sql`lower(${usersInAuth.email}) = ${normalizeEmail(email)}`);
  return row ? toAuthUser(row) : null;
}

export async function deleteUser(id: string, db: Executor = getDb()) {
  await db.delete(usersInAuth).where(eq(usersInAuth.id, id));
}

/**
 * Email + password check. Returns the user or null (wrong email, wrong
 * password, or banned — the caller cannot tell which, on purpose).
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(usersInAuth)
    .where(sql`lower(${usersInAuth.email}) = ${normalizeEmail(email)}`);

  if (!row?.encryptedPassword) return null;
  if (!(await bcrypt.compare(password, row.encryptedPassword))) return null;
  if (row.bannedUntil && new Date(row.bannedUntil) > new Date()) return null;

  await db
    .update(usersInAuth)
    .set({ lastSignInAt: new Date().toISOString() })
    .where(eq(usersInAuth.id, row.id));

  return toAuthUser(row);
}
