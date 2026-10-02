-- Supabase compatibility shim for plain PostgreSQL 16 (Azure Flexible Server).
--
-- Recreates the minimum surface of Supabase that the migrations in
-- supabase/migrations depend on, so they apply unchanged:
--   * roles anon / authenticated / service_role / supabase_auth_admin (NOLOGIN)
--   * schema auth: auth.users, auth.uid(), auth.jwt(), auth.role(), auth.email()
--   * schema storage: storage.buckets, storage.objects, storage.foldername()...
--   * publication supabase_realtime (078 adds notifications to it)
--
-- Nothing here needs superuser: it runs as the Azure admin role (CREATEROLE,
-- member of azure_pg_admin). Idempotent: safe to re-run.
--
-- Identity is passed per transaction through GUCs, exactly like PostgREST did:
--   select set_config('request.jwt.claim.sub', '<uuid>', true);
--   select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
-- See src/lib/db/index.ts (withUser).

-- Roles ---------------------------------------------------------------------
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'supabase_auth_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END
$$;

-- The connecting admin must be able to SET ROLE service_role (withServiceRole
-- in src/lib/db): many triggers exempt `current_user = 'service_role'`.
DO $$
BEGIN
  EXECUTE format('GRANT service_role TO %I', current_user);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not grant service_role to %: %', current_user, SQLERRM;
END
$$;

-- BYPASSRLS requires the granting role to hold it too; best effort. When it
-- fails, db/shims/999_service_role_access.sql emulates it with policies.
DO $$
BEGIN
  ALTER ROLE service_role BYPASSRLS;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'service_role BYPASSRLS not granted (%), policies emulate it', SQLERRM;
END
$$;

-- Extensions (must be allow-listed in azure.extensions on Azure) -------------
CREATE EXTENSION IF NOT EXISTS unaccent;

-- auth -----------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aud                 text DEFAULT 'authenticated',
  role                text DEFAULT 'authenticated',
  email               text,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  confirmed_at        timestamptz,
  phone               text,
  phone_confirmed_at  timestamptz,
  raw_app_meta_data   jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_user_meta_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  banned_until        timestamptz,
  last_sign_in_at     timestamptz,
  is_anonymous        boolean NOT NULL DEFAULT false,
  is_sso_user         boolean NOT NULL DEFAULT false,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
  ON auth.users (lower(email)) WHERE email IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO service_role;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  )::text
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt(), auth.role(), auth.email()
  TO anon, authenticated, service_role;

-- storage (metadata only; bytes live in the src/lib/storage drivers) ---------
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                  text PRIMARY KEY,
  name                text NOT NULL UNIQUE,
  owner               uuid,
  owner_id            text,
  public              boolean NOT NULL DEFAULT false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id         text REFERENCES storage.buckets (id),
  name              text,
  owner             uuid,
  owner_id          text,
  metadata          jsonb,
  user_metadata     jsonb,
  version           text,
  path_tokens       text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_accessed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT ALL ON storage.buckets, storage.objects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;

CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT reverse(split_part(reverse(name), '.', 1))
$$;

-- realtime: 078 adds public.notifications to this publication. Kept so the
-- migration applies; nothing subscribes to it (the app polls instead).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not create publication supabase_realtime: %', SQLERRM;
END
$$;
