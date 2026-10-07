-- ============================================================================
-- PetCloud — Migración 046: equipo de administradores y auditoría de acciones
--
-- Hasta esta migración PetCloud tiene exactamente un admin, sembrado por
-- `scripts/seed-demo.mjs` con la service role y un `profiles.update({role:
-- 'admin'})` directo. Ningún camino de la aplicación crea un admin:
-- `handle_new_user` (001, ampliada por 018) resuelve todo alta a 'owner',
-- 'vet' o 'municipality' — 'admin' queda afuera de la lista blanca a
-- propósito. Crecer el equipo significaba correr el script de siembra contra
-- producción, y una vez que varias personas comparten el panel, nada
-- registraba quién cambió qué.
--
-- Esta migración agrega:
--   1. `admin_action_log`, tabla de solo-alta (mismo patrón que
--      `municipality_census_access_log`, 023).
--   2. `log_admin_action()`, el único escritor de esa tabla, `SECURITY
--      DEFINER` y con el `EXECUTE` revocado de `PUBLIC` — nadie fuera de las
--      funciones de abajo puede forjar una fila.
--   3. `protect_last_platform_admin()`, la guarda del último administrador de
--      la plataforma — **no** `SECURITY DEFINER` y con la tupla de exención
--      **vacía**, a propósito distinta de la de `protect_last_municipality_
--      admin` (020).
--   4. Tres RPC mutadoras `SECURITY DEFINER` (`admin_set_platform_role`,
--      `admin_set_account_suspension`, `admin_register_municipality`), cada
--      una hace su mutación y llama al escritor en la misma transacción.
--   5. Dos RPC de lectura `SECURITY DEFINER` (`admin_user_directory`,
--      `admin_organization_directory`) que reemplazan los mocks de
--      `Usuarios`/`Organizaciones`: existen como funciones porque
--      PostgREST no puede leer columnas de `auth.users` (email,
--      `last_sign_in_at`, `banned_until`) — la misma razón por la que
--      `municipality_census_record` (023) hace JOIN a `auth.users` desde
--      adentro de un cuerpo `SECURITY DEFINER`.
--
-- Por qué el flip de rol funciona: `protect_profile_role()` (001:114) exime
-- `current_user IN ('service_role', 'postgres', 'supabase_admin')`, y dentro
-- de una función `SECURITY DEFINER`, `current_user` es quien **posee** la
-- función — `postgres` — no quien la invoca (postmortem de la 020). Por eso
-- una RPC `SECURITY DEFINER` puede escribir `profiles.role` sin que el
-- trigger de protección lo revierta.
--
-- Por qué la guarda del último admin NO puede ser `SECURITY DEFINER`: si lo
-- fuera, `current_user` sería siempre `postgres` dentro de su propio cuerpo,
-- la exención (si tuviera alguna) se cumpliría siempre, y la guarda nunca
-- contaría nada — exactamente el defecto que la 020 encontró y corrigió en
-- `protect_last_municipality_admin`. Acá se evita desde el día uno.
--
-- Por qué la tupla de exención queda **vacía**, y no la de cuatro roles que
-- dejó la 020: eximir a `postgres` eximiría a nuestra propia RPC —la guarda
-- dejaría de proteger justo el camino que la aplicación usa—. Eximir a
-- `service_role` dejaría que el script de siembra vacíe el equipo entero de
-- un `UPDATE` directo. Y eximir a `supabase_auth_admin` —lo que la 020 sí
-- necesitaba, para que el borrado de cuenta municipal cascadeara— dejaría que
-- `auth.admin.deleteUser` borre al único admin de la plataforma, que es
-- exactamente lo que el criterio de éxito de este cambio prohíbe: "no puede
-- ser revocado **ni borrado**, ni por sí mismo ni por nadie". Acá, a
-- diferencia de la 020, bloquear la cascada es el requisito, no el defecto:
-- borrar la cuenta del único admin de la plataforma debe fallar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admin_action_log
--
-- Solo-agregado: sin `updated_at`, sin política de UPDATE ni de DELETE para
-- ningún rol. `actor_label`/`actor_role` son instantáneas de texto, no un
-- JOIN en vivo — mismo criterio que la 023 y que la 007 sentó para la
-- historia clínica: una fila tiene que seguir siendo legible después de que
-- se borre la cuenta que actuó.
--
-- `target_id` no lleva FK a propósito: es polimórfico (apunta a `profiles` o
-- a `municipalities` según `target_type`), y lo que sostiene la fila en el
-- tiempo es `target_label`, no la referencia. El CHECK final ata `action =
-- 'municipality_registered'` a `target_type = 'municipality'`: es la única
-- acción de este catálogo que no apunta a un perfil.
-- ----------------------------------------------------------------------------
CREATE TABLE admin_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'admin_granted', 'admin_revoked', 'account_suspended',
    'account_reactivated', 'municipality_registered'
  )),
  target_type TEXT NOT NULL CHECK (target_type IN ('profile', 'municipality')),
  target_id UUID,
  target_label TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((action = 'municipality_registered') = (target_type = 'municipality'))
);

CREATE INDEX idx_admin_action_log_occurred ON admin_action_log (occurred_at DESC);

COMMENT ON TABLE admin_action_log IS
  'Auditoría de acciones del panel de administración, solo-agregado. El único '
  'que le escribe es log_admin_action() (046), SECURITY DEFINER con su EXECUTE '
  'revocado de PUBLIC; ningún rol autenticado tiene política de INSERT, UPDATE '
  'ni DELETE sobre esta tabla.';

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Nunca `FORCE ROW LEVEL SECURITY` acá: el dueño de la tabla (el mismo que
-- `log_admin_action()`) tiene que quedar exento de su propia RLS para poder
-- escribir sin ninguna política de INSERT (misma nota que 017 y 023).
-- ============================================================================
ALTER TABLE admin_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_action_log_select" ON admin_action_log FOR SELECT
  USING (is_platform_admin());

-- Sin INSERT, sin UPDATE, sin DELETE para ningún rol autenticado: es lo que
-- vuelve la tabla append-only desde afuera. El único camino de escritura es
-- el INSERT de adentro de log_admin_action(), que corre como el dueño de la
-- tabla y saltea esta RLS por completo.

-- ----------------------------------------------------------------------------
-- log_admin_action()
--
-- Escritor único y privado. `SECURITY DEFINER` para poder insertar sin
-- ninguna política de INSERT. El `REVOKE` de más abajo revoca `PUBLIC`, pero
-- NO es la única defensa: `seed.sql` (entorno local) hace
-- `GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated,
-- service_role` a propósito, para imitar el default privilege real que ya
-- trae producción — así que ese REVOKE por sí solo no sostiene el bloqueo en
-- ninguno de los dos entornos. Por eso el `IF NOT is_platform_admin()` de
-- abajo es la guarda que de verdad importa: sin ella, cualquier cuenta
-- autenticada con EXECUTE (que es lo que ambos entornos terminan otorgando)
-- podría forjar una fila arbitraria. Con ella, una cuenta no-admin queda
-- afuera pase lo que pase con los GRANT; un admin todavía puede llamarla
-- directo y forjar el *contenido* de una fila propia, pero no puede
-- suplantar a otro actor (`v_actor_label`/`v_actor_role` siempre salen de
-- `auth.uid()`, nunca de un parámetro) — el mismo nivel de confianza que ya
-- se le da en las tres RPC de abajo.
-- ----------------------------------------------------------------------------
CREATE FUNCTION log_admin_action(
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_target_label TEXT,
  p_details JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_actor_label TEXT;
  v_actor_role TEXT;
  v_id UUID;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede escribir en el historial de acciones.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT
    actor.first_name || ' ' || actor.last_name || ' <' || actor_user.email || '>',
    actor.role::TEXT
  INTO v_actor_label, v_actor_role
  FROM profiles actor
  JOIN auth.users actor_user ON actor_user.id = actor.id
  WHERE actor.id = auth.uid();

  INSERT INTO admin_action_log (
    actor_profile_id, actor_label, actor_role,
    action, target_type, target_id, target_label, details
  ) VALUES (
    auth.uid(), COALESCE(v_actor_label, 'actor desconocido'),
    COALESCE(v_actor_role, 'desconocido'),
    p_action, p_target_type, p_target_id, p_target_label, p_details
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION log_admin_action(TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION log_admin_action IS
  'Único escritor de admin_action_log. EXECUTE revocado de PUBLIC/anon/'
  'authenticated como defensa adicional, pero la guarda real es el '
  'IF NOT is_platform_admin() del cuerpo: el REVOKE solo no alcanza ni acá '
  'ni en producción (ver comentario de la función). Solo las RPC de esta '
  'misma migración la llaman.';

-- ----------------------------------------------------------------------------
-- protect_last_platform_admin()
--
-- NO SECURITY DEFINER, tupla de exención VACÍA — ver el comentario de cabecera
-- de esta migración para el porqué exacto de las dos decisiones. `current_
-- user` tiene que ser quien escribe de verdad para que la guarda distinga
-- `authenticated` de `service_role` y de `supabase_auth_admin`, y acá no hay
-- ningún valor de `current_user` que la deba esquivar: el invariante "PetCloud
-- siempre tiene al menos un admin" vale contra la aplicación, contra un
-- UPDATE directo con la service role, y contra el borrado de cuenta.
--
-- `pg_advisory_xact_lock(46046)` serializa dos revocaciones concurrentes: sin
-- él, un `count(*)` bajo READ COMMITTED dejaría que dos transacciones vean
-- cada una "queda un admin más" y las dos confirmen. Con el lock, la segunda
-- espera a que la primera termine su transacción y vuelve a contar sobre el
-- estado ya actualizado.
-- ----------------------------------------------------------------------------
CREATE FUNCTION protect_last_platform_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- La fila que cambia no es hoy un admin activo: no sostiene el invariante,
  -- nada que proteger.
  IF OLD.role <> 'admin' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Sigue siendo admin: el cambio es de otra columna del mismo perfil.
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(46046);

  IF (SELECT count(*) FROM profiles WHERE role = 'admin' AND id <> OLD.id) = 0 THEN
    RAISE EXCEPTION
      'PetCloud quedaría sin ningún administrador. Designá otro antes de revocar o eliminar a este.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMENT ON FUNCTION protect_last_platform_admin IS
  'Guarda del último administrador de la plataforma. A propósito NO SECURITY '
  'DEFINER y sin ninguna exención de current_user — divergencia deliberada '
  'de protect_last_municipality_admin (020): acá bloquear auth.admin.'
  'deleteUser sobre el único admin es el requisito, no el defecto.';

CREATE TRIGGER profiles_protect_last_admin
  BEFORE UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_last_platform_admin();

-- Nombrado para ordenar alfabéticamente antes de `profiles_protect_role`
-- (001): los triggers `BEFORE` del mismo evento corren en orden alfabético de
-- nombre, así que esta guarda ve `OLD`/`NEW` antes de que `protect_profile_
-- role` pueda revertir el cambio de rol en silencio para una conexión no
-- eximida.

-- ----------------------------------------------------------------------------
-- admin_set_platform_role(p_email, p_grant)
--
-- Otorga o revoca el rol admin de una cuenta EXISTENTE, resuelta por email —
-- nunca crea una cuenta nueva (decisión 1 de la propuesta). Al revocar,
-- restaura el rol que la cuenta tenía antes del alta más reciente que la
-- volvió admin (`details->>'previous_role'` de la fila `admin_granted` más
-- nueva para ese perfil), o `'owner'` si no hay ninguna — el admin sembrado
-- nunca pasó por esta función para llegar a admin.
-- ----------------------------------------------------------------------------
CREATE FUNCTION admin_set_platform_role(p_email TEXT, p_grant BOOLEAN)
RETURNS UUID AS $$
DECLARE
  v_profile_id UUID;
  v_current_role user_role;
  v_target_label TEXT;
  v_previous_role TEXT;
  v_new_role user_role;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede otorgar o revocar el rol de administrador.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.id, p.role, p.first_name || ' ' || p.last_name || ' <' || u.email || '>'
  INTO v_profile_id, v_current_role, v_target_label
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(p_email);

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No existe ninguna cuenta de PetCloud con ese email.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_grant THEN
    IF v_current_role = 'admin' THEN
      RAISE EXCEPTION 'Esa cuenta ya es administradora.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    UPDATE profiles SET role = 'admin' WHERE id = v_profile_id;

    PERFORM log_admin_action(
      'admin_granted', 'profile', v_profile_id, v_target_label,
      jsonb_build_object('previous_role', v_current_role)
    );
  ELSE
    IF v_current_role <> 'admin' THEN
      RAISE EXCEPTION 'Esa cuenta no es administradora.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    SELECT details->>'previous_role' INTO v_previous_role
    FROM admin_action_log
    WHERE target_type = 'profile'
      AND target_id = v_profile_id
      AND action = 'admin_granted'
    ORDER BY occurred_at DESC
    LIMIT 1;

    v_new_role := COALESCE(v_previous_role, 'owner')::user_role;

    -- log_admin_action() va ANTES del UPDATE a propósito, no después: en una
    -- autorrevocación, quien llama y a quien se revoca son la misma fila.
    -- Si el UPDATE corriera primero, para cuando log_admin_action() llama a
    -- is_platform_admin() el propio rol de quien llama ya sería 'owner' en
    -- esta misma transacción, y la guarda lo rechazaría — rompiendo
    -- justamente la autorrevocación que el spec exige permitir. El orden no
    -- debilita "un revoke bloqueado no deja fila": el trigger
    -- profiles_protect_last_admin corre dentro del UPDATE de abajo, y si
    -- aborta, Postgres revierte la transacción completa — el INSERT que ya
    -- corrió con log_admin_action() se deshace igual.
    PERFORM log_admin_action(
      'admin_revoked', 'profile', v_profile_id, v_target_label,
      jsonb_build_object('restored_role', v_new_role)
    );

    UPDATE profiles SET role = v_new_role WHERE id = v_profile_id;
  END IF;

  RETURN v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_set_platform_role(TEXT, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- admin_set_account_suspension(p_profile_id, p_suspend)
--
-- La suspensión vive en `auth.users.banned_until`, no en una columna de
-- `public`: un campo en `public` no le impide a GoTrue emitir un token, así
-- que el sign-in seguiría funcionando y solo la aplicación podría cortar
-- después. `banned_until = now() + interval '100 years'` es el mecanismo que
-- ya usa GoTrue para un ban indefinido; `NULL` reactiva.
--
-- El trigger de `profiles` no puede ver esta escritura — es una tabla
-- distinta — así que las dos protecciones que el panel necesita (no
-- suspenderse a sí mismo, no dejar a PetCloud sin ningún admin) las hace esta
-- función a mano, antes de tocar `auth.users`.
-- ----------------------------------------------------------------------------
CREATE FUNCTION admin_set_account_suspension(p_profile_id UUID, p_suspend BOOLEAN)
RETURNS BOOLEAN AS $$
DECLARE
  v_role user_role;
  v_target_label TEXT;
  v_other_admins INTEGER;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede suspender o reactivar una cuenta.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_suspend AND p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés suspender tu propia cuenta.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT p.role, p.first_name || ' ' || p.last_name || ' <' || u.email || '>'
  INTO v_role, v_target_label
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_profile_id;

  IF v_target_label IS NULL THEN
    RAISE EXCEPTION 'No existe ninguna cuenta con ese id.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_suspend AND v_role = 'admin' THEN
    SELECT count(*) INTO v_other_admins
    FROM profiles
    WHERE role = 'admin' AND id <> p_profile_id;

    IF v_other_admins = 0 THEN
      RAISE EXCEPTION
        'PetCloud quedaría sin ningún administrador: no se puede suspender al único.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  UPDATE auth.users
  SET banned_until = CASE WHEN p_suspend THEN now() + interval '100 years' ELSE NULL END
  WHERE id = p_profile_id;

  PERFORM log_admin_action(
    CASE WHEN p_suspend THEN 'account_suspended' ELSE 'account_reactivated' END,
    'profile', p_profile_id, v_target_label, '{}'::jsonb
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_set_account_suspension(UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- admin_register_municipality(...)
--
-- `municipalities` no tiene política de INSERT (017:306): el alta pasa por
-- `signUpMunicipality()` con la service role porque en ese momento no hay
-- sesión. Desde el panel sí hay una sesión (la del admin), pero el INSERT y
-- la fila de auditoría tienen que compartir transacción — igual que
-- `municipality_census_record` (023) — así que la única vía es esta RPC
-- `SECURITY DEFINER`, no un `createAdminClient().insert()` desde la Server
-- Action seguido de un segundo write.
-- ----------------------------------------------------------------------------
CREATE FUNCTION admin_register_municipality(
  p_slug TEXT,
  p_name TEXT,
  p_short_name TEXT,
  p_province TEXT,
  p_phone TEXT,
  p_website TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede dar de alta un municipio.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO municipalities (slug, name, short_name, province, phone, website)
  VALUES (p_slug, p_name, p_short_name, p_province, NULLIF(p_phone, ''), NULLIF(p_website, ''))
  RETURNING id INTO v_id;

  PERFORM log_admin_action(
    'municipality_registered', 'municipality', v_id, p_name,
    jsonb_build_object('slug', p_slug)
  );

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_register_municipality(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- admin_user_directory() / admin_organization_directory()
--
-- Son lecturas, no mutaciones, pero devuelven columnas de `auth.users`
-- (email, `last_sign_in_at`, `banned_until`) de TODAS las cuentas. El GRANT a
-- `authenticated` es imprescindible para que PostgREST siquiera enrute la
-- llamada — así que el `IF NOT is_platform_admin()` de la primera línea de
-- cada cuerpo es lo único que separa a cualquier cuenta con sesión de un
-- volcado completo de cuentas/PII vía `rpc()` directo, saltando por
-- completo el `requireAdmin()` de la página. Por eso el assert va **antes**
-- de cualquier SELECT, no después ni intercalado — no hay ninguna versión de
-- este cuerpo que junte una fila antes de haber confirmado el rol de quien
-- llama.
-- ----------------------------------------------------------------------------
CREATE FUNCTION admin_user_directory()
RETURNS TABLE (
  profile_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  role user_role,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  banned_until TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede leer el directorio de cuentas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.first_name, p.last_name, u.email::TEXT, p.role, p.phone, p.address,
    p.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_user_directory() TO authenticated;

CREATE FUNCTION admin_organization_directory()
RETURNS TABLE (
  id UUID,
  type TEXT,
  name TEXT,
  short_name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  validated BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede leer el directorio de organizaciones.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT vi.id, 'vet'::TEXT, vi.name, NULL::TEXT, vi.address, vi.phone, vi.website,
         vi.validated, vi.created_at
  FROM vet_institutions vi
  UNION ALL
  SELECT m.id, 'municipality'::TEXT, m.name, m.short_name, m.center_address, m.phone, m.website,
         m.validated, m.created_at
  FROM municipalities m
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_organization_directory() TO authenticated;

-- ============================================================================
-- ROLLBACK
--
-- Orden: revocar permisos y borrar triggers antes que sus funciones, las
-- funciones antes que la tabla — si la tabla se borrara primero,
-- log_admin_action (que todavía tendría el INSERT en su cuerpo) fallaría
-- contra una tabla inexistente en vez de dar un error claro.
--
-- `banned_until` ya escrito en `auth.users` por admin_set_account_suspension
-- no lo revierte esta migración ni su rollback: reactivar esas cuentas
-- después de revertir es un `auth.admin.updateUserById(id, {ban_duration:
-- 'none'})` manual. Las cuentas promovidas a admin mientras la migración
-- estuvo activa conservan `role = 'admin'`; el script de siembra sigue
-- siendo el respaldo para crear el primero.
-- ============================================================================
-- REVOKE EXECUTE ON FUNCTION admin_organization_directory() FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION admin_user_directory() FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION admin_register_municipality(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION admin_set_account_suspension(UUID, BOOLEAN) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION admin_set_platform_role(TEXT, BOOLEAN) FROM authenticated;
-- DROP FUNCTION IF EXISTS admin_organization_directory();
-- DROP FUNCTION IF EXISTS admin_user_directory();
-- DROP FUNCTION IF EXISTS admin_register_municipality(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS admin_set_account_suspension(UUID, BOOLEAN);
-- DROP FUNCTION IF EXISTS admin_set_platform_role(TEXT, BOOLEAN);
-- DROP TRIGGER IF EXISTS profiles_protect_last_admin ON profiles;
-- DROP FUNCTION IF EXISTS protect_last_platform_admin();
-- DROP FUNCTION IF EXISTS log_admin_action(TEXT, TEXT, UUID, TEXT, JSONB);
-- DROP POLICY IF EXISTS "admin_action_log_select" ON admin_action_log;
-- DROP TABLE IF EXISTS admin_action_log CASCADE;
