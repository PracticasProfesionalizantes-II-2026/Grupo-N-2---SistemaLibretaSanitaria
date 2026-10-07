-- ============================================================================
-- PetCloud — Migración 058: invitaciones al equipo veterinario, y el cierre
-- de la afiliación libre
--
-- POR QUÉ EXISTE
--
-- Dos cosas que son la misma. La primera: el titular no tiene forma de sumar a
-- alguien a su equipo — la pantalla es una fachada. La segunda: cualquier
-- cuenta autenticada puede adosarse sola a la veterinaria que quiera, porque
-- las políticas de INSERT (001:246-249) y UPDATE (001:251-254) de
-- `vet_professionals` solo exigen `auth.uid() = profile_id`, y
-- `protect_vet_privileges()` (019, restatada por la 055) congela la matrícula,
-- su validación, el rol y la guardia, pero nunca mira `institution_id`. Esa
-- deuda está anotada en la 057:45-54.
--
-- Construir la invitación cierra el agujero como efecto: si nadie entra sin
-- aceptar, no hace falta una política que deje entrar.
--
-- EL MOLDE ES LA 045. Invitación por email → aceptación de la persona
-- destinataria, `my_verified_email()` como único punto de decisión de qué
-- cuenta tiene qué email confirmado, y una sola respuesta para todo el lote
-- "no es tuya / venció / ya fue respondida", para no filtrar nunca si una
-- dirección tiene cuenta.
--
-- NUNCA `FORCE ROW LEVEL SECURITY`, ni acá ni en `vet_professionals`. Las
-- funciones `SECURITY DEFINER` de abajo cuentan filas de las dos tablas y una
-- de ellas se llama desde la política de INSERT de `vet_team_invites`: lo
-- único que evita la recursión es que el dueño de la tabla quede exento de su
-- propia RLS. Mismo motivo que 017/023/024/025/042/045/046/053.
--
-- CUERPOS REEMPLAZADOS, ANOTADOS PARA PODER VOLVER
--   · is_institution_member(UUID)  — cuerpo de la 040:26-32, sin `removed_at`.
--   · is_institution_owner(UUID)   — cuerpo de la 005:97-105, sin `removed_at`.
--   · protect_vet_privileges()     — cuerpo de la 055:206-245, sin las guardas
--     de `institution_id` y `removed_at`.
--   · vet_institutions_nearby(NUMERIC) — cuerpo de la 055:292-343, sin
--     `removed_at IS NULL` en las dos subconsultas de guardia.
-- El plan de reversión al pie los restaura.
--
-- PRE-VUELO OBLIGATORIO, JUSTO ANTES DE APLICAR (ver design.md).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · vet_professionals: matrícula por rol, baja blanda, una clínica activa
-- ----------------------------------------------------------------------------
ALTER TABLE vet_professionals ALTER COLUMN license_number DROP NOT NULL;

-- La recepcionista no tiene matrícula, y el CHECK la **obliga** a no tenerla en
-- vez de simplemente permitirlo: sin matrícula no hay `license_validated`, sin
-- eso `is_validated_vet()` es false, y `enforce_signature_requires_license()`
-- (009) le rechaza la firma. Así la guarda sigue siendo ciega al rol y correcta.
ALTER TABLE vet_professionals
  ADD CONSTRAINT vet_professionals_matricula_por_rol CHECK (
    (role_in_institution IN ('owner', 'professional') AND license_number IS NOT NULL)
    OR (role_in_institution = 'assistant' AND license_number IS NULL)
  );

ALTER TABLE vet_professionals ADD COLUMN removed_at TIMESTAMPTZ;

COMMENT ON COLUMN vet_professionals.removed_at IS
  'Baja blanda. No es una preferencia de diseño: seis FK de la 002 y la 008 '
  '(medical_records, vaccinations, dewormings, medications, conditions, visits) '
  'apuntan a vet_professionals(id) sin ON DELETE, así que borrar a quien firmó '
  'algo levanta 23503. La historia clínica sigue nombrando a quien firmó. Toda '
  'condición de pertenencia debe filtrar `removed_at IS NULL`.';

-- Una clínica activa por persona. Parcial a propósito: una plena dejaría a
-- cualquier persona dada de baja permanentemente incontratable.
CREATE UNIQUE INDEX vet_professionals_una_institucion_activa
  ON vet_professionals(profile_id) WHERE removed_at IS NULL;

-- Misma lógica para la matrícula: la fila dada de baja la conserva, y con el
-- UNIQUE pleno de la 001 bloquearía para siempre el alta en otra veterinaria.
-- Dos filas ACTIVAS siguen sin poder compartirla, que es lo que le da sentido:
-- saber quién firmó. La fila vieja que la comparte es de la misma persona.
ALTER TABLE vet_professionals DROP CONSTRAINT vet_professionals_license_number_key;

CREATE UNIQUE INDEX vet_professionals_matricula_activa
  ON vet_professionals(license_number) WHERE removed_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2 · Pertenencia: las dos funciones ignoran a quien fue dado de baja
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_institution_member(p_institution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vet_professionals
    WHERE institution_id = p_institution_id
      AND profile_id = auth.uid()
      AND removed_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_institution_owner(p_institution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vet_professionals
    WHERE institution_id = p_institution_id
      AND profile_id = auth.uid()
      AND role_in_institution = 'owner'
      AND removed_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- 3 · protect_vet_privileges(): las cuatro guardas de la 055, más dos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_vet_privileges()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.license_validated IS DISTINCT FROM OLD.license_validated THEN
    NEW.license_validated := OLD.license_validated;
  END IF;

  IF OLD.license_validated
     AND NEW.license_number IS DISTINCT FROM OLD.license_number
  THEN
    NEW.license_number := OLD.license_number;
  END IF;

  IF NEW.role_in_institution IS DISTINCT FROM OLD.role_in_institution THEN
    NEW.role_in_institution := OLD.role_in_institution;
  END IF;

  IF NEW.on_call AND NOT NEW.license_validated THEN
    NEW.on_call := false;
  END IF;

  -- Quinta guarda: mudarse de veterinaria no se decide desde la propia fila.
  -- RLS no puede compararla contra el valor anterior — decide filas, no
  -- columnas—, así que la mudanza se revierte acá, igual que las cuatro de
  -- arriba. Sin esto, cerrar el INSERT no cierra nada: alcanza con entrar a
  -- una clínica y después cambiarse de institución con un UPDATE.
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    NEW.institution_id := OLD.institution_id;
  END IF;

  -- Sexta: la baja la escribe `revoke_vet_team_member()` y nadie más. La
  -- política de UPDATE ya deja afuera a las filas dadas de baja; esto cubre el
  -- otro sentido, que alguien se reactive solo.
  IF NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    NEW.removed_at := OLD.removed_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION protect_vet_privileges IS
  'Impide que un profesional se cambie a sí mismo la validación de matrícula, '
  'el número ya validado, su rol, la guardia sin matrícula, la institución en '
  'la que trabaja, o su propia baja. Restatada por la 058 sobre el cuerpo de '
  'la 055, que a su vez restató el de la 019.';

-- ----------------------------------------------------------------------------
-- 4 · Políticas de vet_professionals: se cierra la autoafiliación
-- ----------------------------------------------------------------------------
-- El alta normal de una veterinaria escribe con `service_role`
-- (`register-actions.ts`, `createAdminClient()`), que es ajena a RLS: sacar
-- esta política no rompe el registro. Y a partir de acá el único camino de
-- escritura que tiene una persona autenticada es `accept_team_invite()`.
DROP POLICY IF EXISTS "Users can create own vet professional record" ON vet_professionals;

-- La baja tiene exactamente un camino, y es blando.
DROP POLICY IF EXISTS "Vet owners can remove team members" ON vet_professionals;

DROP POLICY IF EXISTS "Vet professionals can update own record" ON vet_professionals;

CREATE POLICY "vet_professionals_update_own" ON vet_professionals FOR UPDATE
  USING (auth.uid() = profile_id AND removed_at IS NULL)
  WITH CHECK (auth.uid() = profile_id AND removed_at IS NULL);

-- La política de SELECT de la 001 (`USING (true)`) queda intacta: de ella
-- depende que `is_institution_owner()` pudiera consultarse a sí misma sin
-- recursión (005:89-95) y que el equipo de una veterinaria sea legible.

-- ----------------------------------------------------------------------------
-- 5 · vet_team_invites — la tabla antes que la función que la referencia
--
-- DESVIACIÓN MECÁNICA DEL BORRADOR DE design.md: ahí "Sección 5" (el límite
-- de plan) va antes que "Sección 6" (esta tabla). Esa orden no compila:
-- `institution_can_add_member()` es `LANGUAGE sql`, y a diferencia de
-- `plpgsql`, Postgres valida el cuerpo de una función SQL contra el catálogo
-- en el momento de `CREATE FUNCTION`, no al invocarla — y esa función lee
-- `vet_team_invites`, que todavía no existiría. Se invierte el orden: la
-- tabla primero (sin sus políticas todavía, porque la de INSERT necesita a su
-- vez `institution_can_add_member`), la función después, las políticas al
-- final. Ninguna condición de negocio cambia, solo el orden de creación.
-- ----------------------------------------------------------------------------
CREATE TYPE team_invite_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE vet_team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL CHECK (invited_email = lower(invited_email)),
  -- 'owner' no está: una institución tiene un titular, el que la fundó.
  -- La regla vive acá y no solo en el modal, porque el modal no es una frontera.
  role_in_institution TEXT NOT NULL DEFAULT 'professional'
    CHECK (role_in_institution IN ('professional', 'assistant')),
  status team_invite_status NOT NULL DEFAULT 'pending',
  -- Congelados en la fila, mismo criterio que `pet_name`/`inviter_name` (045):
  -- `vet_institutions_select` (055) solo abre las validadas, así que quien
  -- recibe la invitación de una clínica todavía en revisión no podría leer ni
  -- el nombre de quien lo invita.
  institution_name TEXT NOT NULL,
  inviter_name TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, invited_email)
);

-- El UNIQUE indexa el par en ese orden; `invited_email` sola no queda cubierta
-- como prefijo y es justo lo que filtran la política de SELECT de quien recibe
-- y las dos funciones de respuesta.
CREATE INDEX idx_vet_team_invites_email ON vet_team_invites(invited_email);
CREATE INDEX idx_vet_team_invites_institution ON vet_team_invites(institution_id);

CREATE TRIGGER vet_team_invites_updated_at
  BEFORE UPDATE ON vet_team_invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE vet_team_invites ENABLE ROW LEVEL SECURITY;

-- Las políticas van más abajo, después de `institution_can_add_member`
-- (sección 6): la de INSERT la llama, y una `CREATE POLICY` que referencia
-- una función inexistente falla igual que la función SQL de más abajo
-- fallaría si esta tabla no existiera todavía.

-- ----------------------------------------------------------------------------
-- 6 · Límite de plan
-- ----------------------------------------------------------------------------
-- Free: el titular y una recepcionista. Premium: sin tope numérico — poner un
-- número es una decisión de precios, y subir un límite no molesta a nadie
-- mientras que bajarlo sí.
--
-- `p_include_pending` es la diferencia entre los dos momentos: al invitar se
-- cuentan miembros activos MÁS invitaciones vivas (si no, se mandan cinco
-- invitaciones para un solo lugar); al aceptar se cuentan solo los activos.
--
-- Nunca se evalúa en una lectura ni sobre una fila existente: cuando el
-- Premium vence, nadie pierde el acceso. Lección ya pagada una vez.
CREATE OR REPLACE FUNCTION institution_can_add_member(
  p_institution_id UUID,
  p_role TEXT,
  p_include_pending BOOLEAN DEFAULT true
)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN p_role NOT IN ('professional', 'assistant') THEN false
    WHEN institution_has_premium(p_institution_id) THEN true
    WHEN p_role = 'professional' THEN false
    ELSE NOT EXISTS (
           SELECT 1 FROM vet_professionals
           WHERE institution_id = p_institution_id
             AND role_in_institution = 'assistant'
             AND removed_at IS NULL
         )
         AND (NOT p_include_pending OR NOT EXISTS (
           SELECT 1 FROM vet_team_invites
           WHERE institution_id = p_institution_id
             AND role_in_institution = 'assistant'
             AND status = 'pending'
             AND expires_at > now()
         ))
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- 6b · Políticas de vet_team_invites — ahora que existen la tabla y la
--      función que la política de INSERT necesita
-- ----------------------------------------------------------------------------
-- El titular ve todas las suyas, incluidas las vencidas: la decisión tomada es
-- que una invitación vencida sigue a la vista para poder reenviarla, y que no
-- se pueda aceptar.
CREATE POLICY "vet_team_invites_select" ON vet_team_invites FOR SELECT
  USING (
    is_institution_owner(institution_id)
    OR (status = 'pending' AND expires_at > now()
        AND invited_email = my_verified_email())
  );

CREATE POLICY "vet_team_invites_insert" ON vet_team_invites FOR INSERT
  WITH CHECK (
    is_institution_owner(institution_id)
    AND invited_by = auth.uid()
    AND status = 'pending'
    AND institution_can_add_member(institution_id, role_in_institution)
  );

-- USING/WITH CHECK coinciden a propósito (041/042/043/045): ningún UPDATE
-- puede mudar la fila a otra institución o a otro invitador en el mismo golpe.
-- Quien recibe la invitación no tiene ningún camino de UPDATE directo.
CREATE POLICY "vet_team_invites_update" ON vet_team_invites FOR UPDATE
  USING (is_institution_owner(institution_id))
  WITH CHECK (
    is_institution_owner(institution_id)
    AND invited_by = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "vet_team_invites_delete" ON vet_team_invites FOR DELETE
  USING (is_institution_owner(institution_id));

-- ----------------------------------------------------------------------------
-- 7 · accept_team_invite — el único camino de escritura de quien acepta
-- ----------------------------------------------------------------------------
-- `SECURITY DEFINER` por tres cosas a la vez: no existe política de INSERT
-- sobre `vet_professionals` para `authenticated`, no existe UPDATE sobre
-- `vet_team_invites` para quien recibe, y la promoción de rol en `profiles`
-- necesita la exención de `protect_profile_role` (001:114-118), que mira
-- `current_user` — adentro de una definer es `postgres`. Misma excepción
-- deliberada que `admin_set_platform_role` (046), afirmada acá por tener una
-- invitación válida dirigida al email confirmado propio.
--
-- Devuelve NULL para todo el lote "no existe / venció / ya fue respondida / es
-- de otro email": una sola salida, sin decir cuál fue. Lo que sí distingue con
-- excepción es lo que le pasa a quien llama y necesita saber.
CREATE OR REPLACE FUNCTION accept_team_invite(
  p_invite_id UUID,
  p_license_number TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_institution UUID;
  v_role TEXT;
  v_license TEXT;
  v_account_role user_role;
  v_professional_id UUID;
BEGIN
  SELECT institution_id, role_in_institution
    INTO v_institution, v_role
  FROM vet_team_invites
  WHERE id = p_invite_id
    AND status = 'pending'
    AND expires_at > now()
    AND invited_email = my_verified_email()
  FOR UPDATE;

  IF v_institution IS NULL THEN
    RETURN NULL;
  END IF;

  -- Punto de serialización del cupo. El lock de arriba es sobre la invitación,
  -- y dos invitaciones distintas para el mismo lugar libre pasarían las dos.
  -- Una fila de `vet_institutions` por aceptación, que nadie más disputa.
  PERFORM 1 FROM vet_institutions WHERE id = v_institution FOR UPDATE;

  SELECT role INTO v_account_role FROM profiles WHERE id = auth.uid();

  IF v_account_role NOT IN ('owner', 'vet') THEN
    RAISE EXCEPTION 'Esta cuenta no puede sumarse al equipo de una veterinaria.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM vet_professionals
    WHERE profile_id = auth.uid() AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ya formás parte de una veterinaria en PetCloud. Pedí la baja antes de aceptar esta invitación.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Sin `p_include_pending`: acá se cuentan miembros activos. Si el Premium
  -- venció con la invitación pendiente, se rechaza y la invitación **queda
  -- pendiente** — honrarla dejaría exceder el límite gratis mandando
  -- invitaciones mientras hay Premium y dejándolas dormidas.
  IF NOT institution_can_add_member(v_institution, v_role, false) THEN
    RAISE EXCEPTION 'La veterinaria no tiene lugar disponible para sumarte en este momento. Escribile a quien te invitó.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  v_license := nullif(upper(trim(coalesce(p_license_number, ''))), '');

  IF v_role = 'assistant' THEN
    -- Se fuerza, no se confía: el CHECK de más arriba la exige NULL, y de eso
    -- depende que una recepcionista no pueda firmar nunca.
    v_license := NULL;
  ELSIF v_license IS NULL THEN
    RAISE EXCEPTION 'Necesitamos tu número de matrícula para sumarte como veterinario.'
      USING ERRCODE = 'restrict_violation';
  ELSIF EXISTS (
    SELECT 1 FROM vet_professionals
    WHERE license_number = v_license
      AND profile_id <> auth.uid()
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Esa matrícula ya está registrada a nombre de otra cuenta.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  INSERT INTO vet_professionals (
    profile_id, institution_id, license_number, role_in_institution
  )
  VALUES (auth.uid(), v_institution, v_license, v_role)
  RETURNING id INTO v_professional_id;

  -- Promoción de rol de plataforma. `sync_role_to_auth` (001:129) propaga el
  -- rol nuevo a `raw_app_meta_data`, pero el token ya emitido sigue diciendo
  -- el anterior: quien acepta tiene que refrescar la sesión antes de entrar al
  -- panel. Lo hace la acción de servidor; ver design.md, decisión 6.
  IF v_account_role = 'owner' THEN
    UPDATE profiles SET role = 'vet' WHERE id = auth.uid();
  END IF;

  UPDATE vet_team_invites
  SET status = 'accepted', responded_at = now()
  WHERE id = p_invite_id;

  RETURN v_professional_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 8 · decline_team_invite — misma validación, sin tocar vet_professionals
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decline_team_invite(p_invite_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE vet_team_invites
  SET status = 'declined', responded_at = now()
  WHERE id = p_invite_id
    AND status = 'pending'
    AND expires_at > now()
    AND invited_email = my_verified_email();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 9 · revoke_vet_team_member — la baja, blanda y con un solo camino
-- ----------------------------------------------------------------------------
-- `on_call = false` en el mismo UPDATE: la baja blanda conserva
-- `license_validated`, así que sin esto la persona seguiría publicada como la
-- guardia de una clínica donde ya no trabaja hasta que alguien apague el
-- interruptor. La 055 se restata igual más abajo — esto es el dato honesto, eso
-- es la frontera.
CREATE OR REPLACE FUNCTION revoke_vet_team_member(p_professional_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_institution UUID;
  v_role TEXT;
  v_profile UUID;
BEGIN
  SELECT institution_id, role_in_institution, profile_id
    INTO v_institution, v_role, v_profile
  FROM vet_professionals
  WHERE id = p_professional_id AND removed_at IS NULL
  FOR UPDATE;

  IF v_institution IS NULL THEN
    RETURN false;
  END IF;

  IF NOT is_institution_owner(v_institution) THEN
    RAISE EXCEPTION 'Solo el titular de la veterinaria puede dar de baja a alguien del equipo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role = 'owner' OR v_profile = auth.uid() THEN
    RAISE EXCEPTION 'El titular no se puede dar de baja a sí mismo.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  UPDATE vet_professionals
  SET removed_at = now(), on_call = false
  WHERE id = p_professional_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION accept_team_invite(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_vet_team_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION institution_can_add_member(UUID, TEXT, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10 · Directorio: quien fue dado de baja deja de figurar de guardia
-- ----------------------------------------------------------------------------
-- Cuerpo íntegro de la 055:292-343 con `AND g.removed_at IS NULL` agregado a
-- las dos subconsultas de guardia (`on_call` y `on_call_names`). Va restatada
-- entera porque CREATE OR REPLACE sustituye la función completa.
-- El índice `idx_vet_professionals_guardia` (055:159) no se toca: sigue
-- sirviendo, y la fila dada de baja ya sale del índice cuando `on_call` pasa a
-- false.
CREATE OR REPLACE FUNCTION vet_institutions_nearby(p_radius_km NUMERIC DEFAULT 10)
RETURNS TABLE (
  id UUID, name TEXT, address TEXT, phone TEXT, website TEXT, logo_url TEXT,
  latitude NUMERIC, longitude NUMERIC, distance_km DOUBLE PRECISION,
  on_call BOOLEAN, on_call_names TEXT[]
) AS $$
  WITH origen AS (
    SELECT m.center_latitude::double precision  AS lat,
           m.center_longitude::double precision AS lng
    FROM profiles p
    JOIN municipalities m ON m.id = p.municipality_id
    WHERE p.id = auth.uid()
      AND m.center_latitude IS NOT NULL
      AND m.center_longitude IS NOT NULL
  ),
  caja AS (
    -- Un grado de latitud es siempre el mismo arco: 2*pi*6371/360 = 111.195
    -- km. En longitud el meridiano se acorta con el coseno de la latitud, así
    -- que el mismo radio abarca más grados cuanto más lejos del ecuador. El
    -- GREATEST evita la división por cero en los polos (inalcanzable acá,
    -- pero una función no se apoya en la geografía de sus usuarios).
    SELECT o.lat, o.lng,
           p_radius_km::double precision / 111.195 AS d_lat,
           p_radius_km::double precision
             / (111.195 * GREATEST(cos(radians(o.lat)), 0.01)) AS d_lng
    FROM origen o
  )
  SELECT v.id, v.name, v.address, v.phone, v.website, v.logo_url,
         v.latitude, v.longitude,
         2 * 6371 * asin(sqrt(
           sin(radians(v.latitude::double precision - c.lat) / 2) ^ 2
           + cos(radians(c.lat)) * cos(radians(v.latitude::double precision))
             * sin(radians(v.longitude::double precision - c.lng) / 2) ^ 2
         )) AS distance_km,
         -- `license_validated` no es decoración acá: sin ese AND, cualquiera
         -- que se adose a esta institución (ver el agujero durmiente arriba)
         -- se publica como el veterinario de guardia de una clínica ajena y
         -- validada. `removed_at IS NULL` es lo que agrega la 058: alguien
         -- dado de baja no puede seguir figurando de guardia.
         EXISTS (SELECT 1 FROM vet_professionals g
                 WHERE g.institution_id = v.id
                   AND g.on_call AND g.license_validated
                   AND g.removed_at IS NULL) AS on_call,
         ARRAY(SELECT concat_ws(' ', pr.first_name, pr.last_name)
               FROM vet_professionals g
               JOIN profiles pr ON pr.id = g.profile_id
               WHERE g.institution_id = v.id
                 AND g.on_call AND g.license_validated
                 AND g.removed_at IS NULL) AS on_call_names
  FROM vet_institutions v, caja c
  WHERE v.validated
    AND v.latitude  BETWEEN (c.lat - c.d_lat)::numeric AND (c.lat + c.d_lat)::numeric
    AND v.longitude BETWEEN (c.lng - c.d_lng)::numeric AND (c.lng + c.d_lng)::numeric
  ORDER BY distance_km
$$ LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public;

COMMENT ON FUNCTION vet_institutions_nearby(NUMERIC) IS
  'Directorio de veterinarias cercanas. SECURITY INVOKER a propósito: seed.sql '
  'da EXECUTE ON ALL FUNCTIONS a anon, y una DEFINER nueva nacería invocable '
  'por cualquiera con la anon key, salteando vet_institutions_select por '
  'dentro. El origen geográfico sale de auth.uid() → profiles.municipality_id '
  '→ municipalities.center_*, nunca de un parámetro. on_call y on_call_names '
  'filtran por license_validated y, desde la 058, por removed_at IS NULL: '
  'alguien dado de baja deja de figurar de guardia en el directorio público.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- -- 10 · vet_institutions_nearby(NUMERIC): restatar el cuerpo de la 055:292-343
-- --      tal cual, sin `removed_at IS NULL`.
-- REVOKE EXECUTE ON FUNCTION institution_can_add_member(UUID, TEXT, BOOLEAN) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION revoke_vet_team_member(UUID) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION decline_team_invite(UUID) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION accept_team_invite(UUID, TEXT) FROM authenticated;
-- DROP FUNCTION IF EXISTS revoke_vet_team_member(UUID);
-- DROP FUNCTION IF EXISTS decline_team_invite(UUID);
-- DROP FUNCTION IF EXISTS accept_team_invite(UUID, TEXT);
-- DROP POLICY IF EXISTS "vet_team_invites_delete" ON vet_team_invites;
-- DROP POLICY IF EXISTS "vet_team_invites_update" ON vet_team_invites;
-- DROP POLICY IF EXISTS "vet_team_invites_insert" ON vet_team_invites;
-- DROP POLICY IF EXISTS "vet_team_invites_select" ON vet_team_invites;
-- DROP TRIGGER IF EXISTS vet_team_invites_updated_at ON vet_team_invites;
-- DROP INDEX IF EXISTS idx_vet_team_invites_institution;
-- DROP INDEX IF EXISTS idx_vet_team_invites_email;
-- DROP TABLE IF EXISTS vet_team_invites CASCADE;
-- DROP TYPE IF EXISTS team_invite_status;
-- DROP FUNCTION IF EXISTS institution_can_add_member(UUID, TEXT, BOOLEAN);
--   -- `institution_can_add_member` va DESPUÉS de la tabla: la política de
--   -- INSERT depende de ella y el DROP falla mientras exista.
--
-- -- Políticas de vet_professionals, como estaban:
-- DROP POLICY IF EXISTS "vet_professionals_update_own" ON vet_professionals;
-- CREATE POLICY "Users can create own vet professional record"
--   ON vet_professionals FOR INSERT TO authenticated
--   WITH CHECK (auth.uid() = profile_id);
-- CREATE POLICY "Vet professionals can update own record"
--   ON vet_professionals FOR UPDATE
--   USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
-- CREATE POLICY "Vet owners can remove team members"
--   ON vet_professionals FOR DELETE
--   USING (is_institution_owner(institution_id) AND role_in_institution <> 'owner');
--
-- -- protect_vet_privileges(): restatar el cuerpo de la 055:206-245 (cuatro
-- -- guardas, sin institution_id ni removed_at).
-- -- is_institution_member(): cuerpo de la 040:26-32.
-- -- is_institution_owner(): cuerpo de la 005:97-105.
--
-- -- Columnas y restricciones. `removed_at`, el CHECK de matrícula por rol y
-- -- los dos índices parciales pueden quedarse: son inertes cuando nadie los
-- -- escribe. Solo si una fila con matrícula NULL bloquea un camino restaurado
-- -- hace falta soltar el CHECK, y solo si vuelve el UNIQUE pleno hace falta
-- -- comprobar antes que ninguna matrícula se repita entre filas dadas de baja
-- -- y activas — si se repite, el ALTER falla y hay que decidir cuál sobrevive.
-- ALTER TABLE vet_professionals DROP CONSTRAINT IF EXISTS vet_professionals_matricula_por_rol;
-- DROP INDEX IF EXISTS vet_professionals_matricula_activa;
-- DROP INDEX IF EXISTS vet_professionals_una_institucion_activa;
-- ALTER TABLE vet_professionals ADD CONSTRAINT vet_professionals_license_number_key UNIQUE (license_number);
-- ALTER TABLE vet_professionals ALTER COLUMN license_number SET NOT NULL;
-- ALTER TABLE vet_professionals DROP COLUMN IF EXISTS removed_at;
