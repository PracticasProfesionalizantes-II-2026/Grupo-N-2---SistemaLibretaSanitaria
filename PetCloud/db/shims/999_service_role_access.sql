-- Runs after every migration (re-applied on each db:migrate run).
--
-- Supabase's service_role has BYPASSRLS and default privileges on everything.
-- On Azure the admin cannot grant BYPASSRLS, so this emulates it: full grants
-- plus a permissive `service_role_all` policy on every RLS-enabled table.
-- RLS enforcement for end users is out of scope for now (the app connects as
-- the admin, which owns the tables and is therefore not subject to RLS).

DO $$
DECLARE
  s text;
  t record;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'storage', 'erp'] LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', s);
      EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO service_role', s);
      EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO service_role', s);
      EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO service_role', s);
    END IF;
  END LOOP;

  FOR t IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND n.nspname IN ('public', 'storage', 'erp')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = t.nspname AND tablename = t.relname
        AND policyname = 'service_role_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY service_role_all ON %I.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t.nspname, t.relname
      );
    END IF;
  END LOOP;
END
$$;
