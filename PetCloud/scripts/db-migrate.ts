/**
 * Applies the database schema to the Postgres pointed at by DATABASE_URL.
 *
 * Order:
 *   1. db/shims/0xx_*.sql   — compatibility surface (auth schema, roles) (idempotent, every run)
 *   2. db/migrations/*.sql — once each, tracked in public._migrations
 *   3. db/shims/9xx_*.sql   — post-migration fixes (idempotent, every run)
 *
 * Each file runs in its own transaction; the first failure aborts the run.
 *
 * Usage: npm run db:migrate            (reads DATABASE_URL from env / .env.local)
 *        npm run db:migrate -- --dry   (lists pending files only)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const ROOT = path.resolve(import.meta.dirname, "..");
const SHIMS_DIR = path.join(ROOT, "db/shims");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const POST_SHIM_PREFIX = "9";

const dryRun = process.argv.includes("--dry");

async function listSql(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith(".sql")).sort();
}

function sslFor(url: string): pg.ClientConfig["ssl"] {
  const mode = new URL(url).searchParams.get("sslmode");
  if (mode === "disable" || !mode) {
    const host = new URL(url).hostname;
    // Local docker/dev databases usually have no TLS; remote ones must.
    return host === "localhost" || host === "127.0.0.1" ? false : true;
  }
  return true;
}

async function runFile(client: pg.Client, file: string, label: string) {
  const sql = await readFile(file, "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`, { cause: error });
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (see docs/desarrollo/entorno-local.md).");
    process.exit(1);
  }

  // pg parses sslmode from the URL with its own (stricter) semantics; strip it
  // and pass `ssl` explicitly instead.
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  const client = new pg.Client({
    connectionString: parsed.toString(),
    ssl: sslFor(url),
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const shims = await listSql(SHIMS_DIR);
    const preShims = shims.filter((f) => !f.startsWith(POST_SHIM_PREFIX));
    const postShims = shims.filter((f) => f.startsWith(POST_SHIM_PREFIX));

    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM public._migrations",
    );
    const applied = new Set(rows.map((r) => r.name));
    const pending = (await listSql(MIGRATIONS_DIR)).filter(
      (f) => !applied.has(f),
    );

    if (dryRun) {
      console.log(`Pending migrations (${pending.length}):`);
      pending.forEach((f) => console.log(`  ${f}`));
      return;
    }

    for (const f of preShims) {
      await runFile(client, path.join(SHIMS_DIR, f), `shim ${f}`);
      console.log(`shim      ${f}`);
    }

    for (const f of pending) {
      await runFile(client, path.join(MIGRATIONS_DIR, f), `migration ${f}`);
      await client.query("INSERT INTO public._migrations (name) VALUES ($1)", [
        f,
      ]);
      console.log(`migration ${f}`);
    }

    for (const f of postShims) {
      await runFile(client, path.join(SHIMS_DIR, f), `shim ${f}`);
      console.log(`shim      ${f}`);
    }

    console.log(
      `Done: ${pending.length} migration(s) applied, ${applied.size} already present.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
