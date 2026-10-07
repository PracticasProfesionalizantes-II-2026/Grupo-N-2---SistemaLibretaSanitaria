-- Runs after every migration (re-applied on each db:migrate run).
--
-- On the original platform every SECURITY DEFINER function is owned by `postgres`, so
-- inside them `current_user = 'postgres'` and the guard triggers that exempt
-- `current_user IN ('service_role', 'postgres', 'supabase_admin')` let their
-- writes through (e.g. admin_set_vet_license -> protect_vet_privileges).
--
-- Here the migrations run as the app admin, which then owns those functions,
-- and the triggers silently reverted what the functions wrote. Handing them
-- to `service_role` restores the original behaviour: the function body runs
-- as service_role (exempt from the guards, RLS emulated by 999), while the
-- app's own direct writes still run as the admin and stay guarded.

DO $$
DECLARE
  f record;
BEGIN
  -- Functions such as handle_new_user / sync_role_to_auth write auth.users.
  GRANT USAGE ON SCHEMA auth TO service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;
  -- A function owner needs CREATE on its schema.
  GRANT CREATE ON SCHEMA public, erp, storage, auth TO service_role;

  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public', 'erp', 'storage', 'auth')
      AND pg_get_userbyid(p.proowner) <> 'service_role'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO service_role', f.sig);
  END LOOP;
END
$$;
