import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "@/lib/db/schema/schema";
import type { Database } from "@/types/database";

/**
 * Data access over Azure Database for PostgreSQL (or any Postgres 16).
 *
 * The app connects with a single admin role (DATABASE_URL). That role owns the
 * tables, so RLS policies are NOT enforced for it — accepted for now, see
 * the repository README. What still runs is everything inside the database that
 * reads the identity from the request GUCs (`auth.uid()`): SECURITY DEFINER
 * RPCs, triggers and guards. That is what `withUser` provides.
 */

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// PostgREST returned numeric and bigint as JSON numbers; the mappers expect that.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

function createPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL en .env.local (ver README del repositorio).",
    );
  }

  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");
  parsed.searchParams.delete("sslmode");
  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);

  return new pg.Pool({
    connectionString: parsed.toString(),
    ssl: sslmode === "disable" || (!sslmode && isLocal) ? false : true,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
}

// Next dev re-evaluates modules on every change; keep one pool per process.
const globalForDb = globalThis as unknown as { __petcloudPool?: pg.Pool };

function getPool(): pg.Pool {
  globalForDb.__petcloudPool ??= createPool();
  return globalForDb.__petcloudPool;
}

let dbInstance: Db | undefined;

/** Lazily created so `next build` works without DATABASE_URL. */
export function getDb(): Db {
  dbInstance ??= drizzle(getPool(), { schema });
  return dbInstance;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Runs `fn` in a transaction where `auth.uid()` returns `userId` and
 * `auth.jwt()` returns the claims, like PostgREST did for each request.
 * Required for every RPC or write whose SQL reads auth.uid().
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  extraClaims: Record<string, unknown> = {},
): Promise<T> {
  const claims = JSON.stringify({
    sub: userId,
    role: "authenticated",
    ...extraClaims,
  });

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claim.sub', ${userId}, true),
                 set_config('request.jwt.claims', ${claims}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Runs `fn` as `service_role`, the equivalent of the former admin client:
 * triggers that exempt `current_user = 'service_role'` let the write through,
 * and the `service_role_all` policies (db/shims/999) emulate BYPASSRLS.
 */
export async function withServiceRole<T>(fn: (tx: Tx) => Promise<T>) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role service_role`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`,
    );
    return fn(tx);
  });
}

/**
 * Note: interpolating a JS array in a `sql` template expands it to a tuple
 * (`($1, $2)`); wrap it in `sql.param(array)` to send it as one Postgres array.
 *
 * Calls a SQL function (ex `rpc()` client call) with named arguments:
 * `rpc(tx, "my_fn", { p_id: id })` → `select * from my_fn(p_id => $1)`.
 * Returns the rows; scalar functions come back as `[{ my_fn: value }]`.
 */
export async function rpc<Row = Record<string, unknown>>(
  executor: Pick<Db, "execute">,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<Row[]> {
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(fn)) {
    throw new Error(`rpc: nombre de función inválido: ${fn}`);
  }

  const named: SQL[] = Object.entries(args).map(([name, value]) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      throw new Error(`rpc: nombre de argumento inválido: ${name}`);
    }
    return sql`${sql.raw(name)} => ${sql.param(value)}`;
  });

  const result = await executor.execute(
    sql`select * from ${sql.raw(fn)}(${sql.join(named, sql`, `)})`,
  );
  return result.rows as Row[];
}

/**
 * Raw SQL read that returns snake_case rows, the same shape the old hosted
 * client returned, so the existing mappers and `@/types/database` row types
 * keep working: `query<Tables<"pets">>(getDb(), sql\`select * from pets\`)`.
 */
export async function query<Row = Record<string, unknown>>(
  executor: Pick<Db, "execute">,
  statement: SQL,
): Promise<Row[]> {
  const result = await executor.execute(statement);
  return result.rows as Row[];
}

type Functions = Database["public"]["Functions"];

/** Row type of a set-returning SQL function, from the generated types. */
export type FnRow<N extends keyof Functions> =
  Functions[N]["Returns"] extends (infer R)[] ? R : Functions[N]["Returns"];

function tableName(table: string): SQL {
  return sql.join(
    table.split(".").map((part) => sql.identifier(part)),
    sql`.`,
  );
}

const defined = (row: Record<string, unknown>) =>
  Object.entries(row).filter(([, value]) => value !== undefined);

/**
 * `insert into <table> (cols) select <values> [where <guard>]` from a
 * snake_case object (ex `from(t).insert(row)` client call). `undefined` values
 * are skipped so column defaults apply. The optional guard lets the insert
 * check permissions (e.g. `has_pet_access(...)`); append `returning ...`.
 */
export function insertInto(
  table: string,
  row: Record<string, unknown>,
  guard?: SQL,
): SQL {
  const entries = defined(row);
  return sql`insert into ${tableName(table)} (${sql.join(
    entries.map(([column]) => sql.identifier(column)),
    sql`, `,
  )}) select ${sql.join(
    entries.map(([, value]) => sql`${sql.param(value)}`),
    sql`, `,
  )}${guard ? sql` where ${guard}` : sql``}`;
}

/** `update <table> set col = value, ...` (ex-`.update(row)`); add `where`. */
export function updateSet(table: string, row: Record<string, unknown>): SQL {
  return sql`update ${tableName(table)} set ${sql.join(
    defined(row).map(
      ([column, value]) => sql`${sql.identifier(column)} = ${value}`,
    ),
    sql`, `,
  )}`;
}

/**
 * The Postgres error behind a failed query (Drizzle wraps it in `cause`), so
 * callers can show `RAISE EXCEPTION` messages or check SQLSTATE codes.
 */
export function dbError(error: unknown): { message: string; code?: string } {
  const pgError = (error as { cause?: { message?: string; code?: string } })
    ?.cause;
  if (pgError?.message) return { message: pgError.message, code: pgError.code };
  return { message: error instanceof Error ? error.message : String(error) };
}
