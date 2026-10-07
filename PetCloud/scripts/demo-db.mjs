/**
 * Shared bits of the demo scripts (seed, unseed, bootstrap-admin): read
 * DATABASE_URL like `db:migrate` does and run work as `service_role`, the role
 * the database triggers exempt (same as `withServiceRole` in src/lib/db).
 */
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export const DEMO_EMAILS = {
  owner: "dueno@petcloud.local",
  vet: "vet@petcloud.local",
  pendingVet: "vet.pendiente@petcloud.local",
  admin: "admin@petcloud.local",
};

export const DEMO_INSTITUTION = "Veterinaria San Roque (demo)";
export const DEMO_PENDING_INSTITUTION = "Clínica Patitas (demo)";

export async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (see docs/desarrollo/entorno-local.md).");
    process.exit(1);
  }

  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");
  parsed.searchParams.delete("sslmode");
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);

  const client = new pg.Client({
    connectionString: parsed.toString(),
    ssl: sslmode === "disable" || (!sslmode && local) ? false : true,
  });
  await client.connect();
  return client;
}

/** Runs `fn` in a transaction as service_role. */
export async function asServiceRole(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * Creates (or resets the password of) a confirmed user in `auth.users`, like
 * `createUser` in src/lib/auth/admin.ts. The `handle_new_user` trigger builds
 * the profile from `raw_user_meta_data`.
 */
export async function upsertUser(
  client,
  { email, password, role, first, last },
) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await client.query(
    "SELECT id FROM auth.users WHERE lower(email) = lower($1)",
    [email],
  );

  if (rows[0]) {
    await client.query(
      "UPDATE auth.users SET encrypted_password = $2, updated_at = now() WHERE id = $1",
      [rows[0].id, hash],
    );
    return { id: rows[0].id, created: false };
  }

  const inserted = await client.query(
    `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at,
       confirmed_at, raw_user_meta_data, raw_app_meta_data)
     VALUES (lower($1), $2, now(), now(), $3, '{"provider":"email"}')
     RETURNING id`,
    [email, hash, JSON.stringify({ role, first_name: first, last_name: last })],
  );
  return { id: inserted.rows[0].id, created: true };
}
