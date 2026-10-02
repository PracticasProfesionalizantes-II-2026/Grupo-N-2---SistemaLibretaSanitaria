import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Drizzle is used as a typed query builder only. The schema is owned by the
 * SQL files in supabase/migrations (applied with `npm run db:migrate`), and
 * src/lib/db/schema is regenerated from the live database with
 * `npm run db:introspect`. Never run `drizzle-kit push/generate` here.
 */
export default defineConfig({
  dialect: "postgresql",
  out: "./src/lib/db/schema",
  schemaFilter: ["public", "erp", "auth"],
  tablesFilter: ["!_migrations"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
