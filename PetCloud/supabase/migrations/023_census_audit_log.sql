-- ============================================================================
-- PetCloud — Migración 023: la cerradura del padrón
--
-- La 022 dejó `municipality_census_record` y `municipality_census_export` con
-- el `EXECUTE` revocado de `PUBLIC`, `anon` y `authenticated`. Esta migración
-- las habilita — y solo lo hace después de agregarles, dentro del mismo
-- cuerpo, el INSERT que deja registrado quién vio qué. No hay ningún momento
-- en producción donde la puerta esté abierta sin su registro: GRANT e INSERT
-- viven en el mismo archivo.
--
-- Por qué no se puede saltear: `municipality_census_access_log` no tiene
-- ninguna política de INSERT para ningún rol autenticado — el único que le
-- escribe es el cuerpo `SECURITY DEFINER` de estas dos funciones, que corre
-- como el dueño de la tabla y saltea su RLS sin necesitar ninguna política de
-- escritura. Si el INSERT fallara, la función entera falla y no se devuelve
-- ni una fila; y nadie puede escribirle a la tabla sin pasar por la función,
-- porque RLS está activo y no hay política que lo autorice.
--
-- `municipality_census_page` (022) sigue sin auditarse: hojear nombres de
-- mascotas no es un acceso a datos personales.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- municipality_census_access_log
--
-- Solo-agregado: sin `updated_at`, sin política de UPDATE ni de DELETE para
-- ningún rol. Un registro que el propio municipio puede editar no es un
-- registro de auditoría.
--
-- Snapshots (`actor_label`, `actor_role`, `pet_label`) en vez de un JOIN al
-- momento de leer: una fila que diga "usuario 3f2a… (dado de baja)" no
-- contesta quién consultó el registro. Mismo principio que la 007 sentó para
-- el historial clínico que sobrevive a la baja de una cuenta.
--
-- `export_filters` + `record_count`: auditar la ficha individual y no la
-- descarga masiva audita lo chico y deja pasar lo grande. El CHECK de abajo
-- obliga a que `record_view` traiga la mascota puntual y a que cualquier otra
-- acción traiga cuántas filas salieron.
--
-- `action` incluye `stats_export` para cuando exista su propia función
-- `SECURITY DEFINER` (fase posterior); esta migración no la escribe.
--
-- `ip_address` / `user_agent` quedan NULL en las dos funciones de abajo: no
-- hay forma de leer el encabezado HTTP desde un cuerpo `plpgsql` llamado con
-- la misma firma que la 022 sin inventar un mecanismo nuevo y sin prueba que
-- lo cubra. Documentado, no escondido — para cuando la acción de servidor que
-- sí tiene el encabezado (`exportCensus`/`exportStats`, fase posterior) exista.
-- ----------------------------------------------------------------------------
CREATE TABLE municipality_census_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('record_view', 'census_export', 'stats_export')),
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  pet_label TEXT,
  export_filters JSONB,
  record_count INTEGER,
  ip_address INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (action = 'record_view' AND pet_id IS NOT NULL)
    OR (action <> 'record_view' AND record_count IS NOT NULL)
  )
);

CREATE INDEX idx_census_access_log_municipality
  ON municipality_census_access_log (municipality_id, occurred_at DESC);

CREATE INDEX idx_census_access_log_pet
  ON municipality_census_access_log (pet_id)
  WHERE pet_id IS NOT NULL;

COMMENT ON TABLE municipality_census_access_log IS
  'Auditoría de acceso al padrón, solo-agregado. El único que le escribe es el '
  'cuerpo SECURITY DEFINER de municipality_census_record/export (023); ningún '
  'rol autenticado tiene política de INSERT, UPDATE ni DELETE sobre esta tabla.';

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Lectura no anidada a propósito (Divergencia D3): `readonly` SÍ, `operator`
-- NO, `admin` SÍ — no es la jerarquía habitual donde cada rol superior incluye
-- al inferior. La auditoría vive dentro de Configuración, que la decisión 5
-- deja fuera del alcance de `operator`.
--
-- Nunca `FORCE ROW LEVEL SECURITY` acá: el dueño de la tabla (el mismo que las
-- dos funciones de abajo) queda exento de su propia RLS, y es lo único que
-- permite al INSERT del cuerpo de la función escribir sin política de INSERT
-- (misma nota que la 017).
-- ============================================================================
ALTER TABLE municipality_census_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "census_access_log_select" ON municipality_census_access_log
  FOR SELECT
  USING (
    municipality_id = my_municipality_id()
    AND my_municipality_role() IN ('readonly', 'admin')
  );

-- Sin INSERT, sin UPDATE, sin DELETE para ningún rol autenticado: es lo que
-- vuelve la tabla append-only desde afuera. El único camino de escritura es el
-- INSERT de adentro de las dos funciones de más abajo, que corren como el
-- dueño de la tabla y saltean esta RLS por completo.

-- ============================================================================
-- municipality_census_record — ahora con el INSERT de auditoría
--
-- Misma firma que la 022. El chequeo de `to_regclass` queda como segunda
-- barrera de defensa (documenta la capa doble, aunque hoy sea imposible que el
-- EXECUTE se otorgue sin que esta migración haya corrido).
--
-- Si la mascota no existe o pertenece a otra jurisdicción, la búsqueda no
-- encuentra fila: cero filas devueltas, cero auditoría escrita. No hay nada
-- que auditar sobre PII que la función nunca leyó.
-- ============================================================================
CREATE OR REPLACE FUNCTION municipality_census_record(p_pet_id UUID)
RETURNS TABLE (
  id UUID,
  municipal_registry_number TEXT,
  name TEXT,
  species pet_species,
  breed TEXT,
  sex pet_sex,
  date_of_birth DATE,
  neutered BOOLEAN,
  color TEXT,
  qr_code TEXT,
  neighborhood_id UUID,
  neighborhood_name TEXT,
  rabies_status TEXT,
  owner_first_name TEXT,
  owner_last_name TEXT,
  owner_phone TEXT,
  owner_address TEXT,
  owner_email TEXT
) AS $$
DECLARE
  v_row RECORD;
  v_actor_label TEXT;
  v_pet_label TEXT;
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF to_regclass('public.municipality_census_access_log') IS NULL THEN
    RAISE EXCEPTION
      'El padrón está cerrado: falta la migración 023 (registro de auditoría).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT
    p.id,
    p.municipal_registry_number,
    p.name,
    p.species,
    p.breed,
    p.sex,
    p.date_of_birth,
    p.neutered,
    p.color,
    p.qr_code,
    o.neighborhood_id,
    n.name AS neighborhood_name,
    CASE
      WHEN rv.applied_at IS NULL THEN 'sin-datos'
      WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
        < CURRENT_DATE THEN 'vencida'
      WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
        <= CURRENT_DATE + INTERVAL '30 days' THEN 'por-vencer'
      ELSE 'al-dia'
    END AS rabies_status,
    o.first_name AS owner_first_name,
    o.last_name AS owner_last_name,
    o.phone AS owner_phone,
    o.address AS owner_address,
    -- `auth.users.email` es varchar(255); sin este cast, el RETURN QUERY de
    -- abajo rompe contra el TEXT declarado en RETURNS TABLE.
    u.email::TEXT AS owner_email
  INTO v_row
  FROM pets p
  JOIN profiles o ON o.id = p.owner_id
  JOIN auth.users u ON u.id = o.id
  LEFT JOIN municipality_neighborhoods n ON n.id = o.neighborhood_id
  LEFT JOIN LATERAL (
    SELECT v.applied_at, v.next_dose_at
    FROM vaccinations v
    WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
    ORDER BY v.applied_at DESC
    LIMIT 1
  ) rv ON true
  WHERE p.id = p_pet_id
    AND o.municipality_id = my_municipality_id();

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT actor.first_name || ' ' || actor.last_name || ' <' || actor_user.email || '>'
  INTO v_actor_label
  FROM profiles actor
  JOIN auth.users actor_user ON actor_user.id = actor.id
  WHERE actor.id = auth.uid();

  v_pet_label := COALESCE(v_row.municipal_registry_number, 'sin-registro')
    || ' — ' || v_row.name;

  INSERT INTO municipality_census_access_log (
    municipality_id, actor_profile_id, actor_label, actor_role,
    action, pet_id, pet_label
  ) VALUES (
    my_municipality_id(), auth.uid(), v_actor_label, my_municipality_role(),
    'record_view', v_row.id, v_pet_label
  );

  RETURN QUERY
  SELECT
    v_row.id, v_row.municipal_registry_number, v_row.name, v_row.species,
    v_row.breed, v_row.sex, v_row.date_of_birth, v_row.neutered, v_row.color,
    v_row.qr_code, v_row.neighborhood_id, v_row.neighborhood_name,
    v_row.rabies_status, v_row.owner_first_name, v_row.owner_last_name,
    v_row.owner_phone, v_row.owner_address, v_row.owner_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

COMMENT ON FUNCTION municipality_census_record IS
  'Ficha completa de una mascota. Escribe "record_view" en municipality_census_access_log '
  'antes de devolver, misma transacción: si el INSERT falla, no se devuelve nada. '
  'EXECUTE otorgado a authenticated en esta misma migración.';

-- ============================================================================
-- municipality_census_export — ahora con el INSERT de auditoría
--
-- A diferencia de la ficha, acá SIEMPRE se audita, incluso con cero filas: una
-- exportación es un acto deliberado con un resultado, no un intento fallido de
-- leer una mascota fuera de jurisdicción. El conteo se calcula con una
-- subconsulta separada antes del INSERT, no contando filas ya devueltas.
-- ============================================================================
CREATE OR REPLACE FUNCTION municipality_census_export(p_filters JSONB DEFAULT '{}'::jsonb)
RETURNS TABLE (
  id UUID,
  municipal_registry_number TEXT,
  name TEXT,
  species pet_species,
  breed TEXT,
  sex pet_sex,
  date_of_birth DATE,
  neutered BOOLEAN,
  color TEXT,
  qr_code TEXT,
  neighborhood_id UUID,
  neighborhood_name TEXT,
  rabies_status TEXT,
  owner_first_name TEXT,
  owner_last_name TEXT,
  owner_phone TEXT,
  owner_address TEXT,
  owner_email TEXT
) AS $$
DECLARE
  v_filters JSONB := COALESCE(p_filters, '{}'::jsonb);
  v_ids UUID[];
  v_count INTEGER;
  v_actor_label TEXT;
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF to_regclass('public.municipality_census_access_log') IS NULL THEN
    RAISE EXCEPTION
      'El padrón está cerrado: falta la migración 023 (registro de auditoría).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Un solo pasaje calcula qué mascotas coinciden con los filtros. El conteo
  -- y el RETURN QUERY de abajo comparten este arreglo de ids en vez de repetir
  -- el filtro dos veces: `record_count` es exactamente `array_length`, y la
  -- consulta final solo necesita `p.id = ANY(v_ids)`.
  SELECT array_agg(censo.id) INTO v_ids
  FROM (
    SELECT
      p.id, p.name, p.municipal_registry_number, p.species, o.neighborhood_id,
      CASE
        WHEN rv.applied_at IS NULL THEN 'sin-datos'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          < CURRENT_DATE THEN 'vencida'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          <= CURRENT_DATE + INTERVAL '30 days' THEN 'por-vencer'
        ELSE 'al-dia'
      END AS rabies_status
    FROM pets p
    JOIN profiles o ON o.id = p.owner_id
    LEFT JOIN LATERAL (
      SELECT v.applied_at, v.next_dose_at
      FROM vaccinations v
      WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      ORDER BY v.applied_at DESC
      LIMIT 1
    ) rv ON true
    WHERE o.municipality_id = my_municipality_id()
  ) censo
  WHERE (NULLIF(v_filters->>'search', '') IS NULL
         OR censo.name ILIKE '%' || (v_filters->>'search') || '%'
         OR censo.municipal_registry_number ILIKE '%' || (v_filters->>'search') || '%')
    AND (NULLIF(v_filters->>'species', '') IS NULL
         OR censo.species = (v_filters->>'species')::pet_species)
    AND (NULLIF(v_filters->>'neighborhood_id', '') IS NULL
         OR censo.neighborhood_id = (v_filters->>'neighborhood_id')::uuid)
    AND (NULLIF(v_filters->>'rabies_status', '') IS NULL
         OR censo.rabies_status = (v_filters->>'rabies_status'));

  -- `array_agg` de cero filas da NULL, no un arreglo vacío.
  v_count := COALESCE(array_length(v_ids, 1), 0);

  SELECT actor.first_name || ' ' || actor.last_name || ' <' || actor_user.email || '>'
  INTO v_actor_label
  FROM profiles actor
  JOIN auth.users actor_user ON actor_user.id = actor.id
  WHERE actor.id = auth.uid();

  INSERT INTO municipality_census_access_log (
    municipality_id, actor_profile_id, actor_label, actor_role,
    action, export_filters, record_count
  ) VALUES (
    my_municipality_id(), auth.uid(), v_actor_label, my_municipality_role(),
    'census_export', v_filters, v_count
  );

  -- `p.id = ANY(v_ids)` con `v_ids` NULL evalúa NULL (falso): cero filas, sin
  -- necesitar un caso especial para el conjunto vacío.
  RETURN QUERY
  SELECT
    p.id, p.municipal_registry_number, p.name, p.species, p.breed, p.sex,
    p.date_of_birth, p.neutered, p.color, p.qr_code, o.neighborhood_id,
    n.name AS neighborhood_name,
    CASE
      WHEN rv.applied_at IS NULL THEN 'sin-datos'
      WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
        < CURRENT_DATE THEN 'vencida'
      WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
        <= CURRENT_DATE + INTERVAL '30 days' THEN 'por-vencer'
      ELSE 'al-dia'
    END AS rabies_status,
    o.first_name AS owner_first_name, o.last_name AS owner_last_name,
    o.phone AS owner_phone, o.address AS owner_address,
    -- Mismo cast que en municipality_census_record (defecto latente ya en
    -- el cuerpo de la 022, nunca antes ejercido de punta a punta).
    u.email::TEXT AS owner_email
  FROM pets p
  JOIN profiles o ON o.id = p.owner_id
  JOIN auth.users u ON u.id = o.id
  LEFT JOIN municipality_neighborhoods n ON n.id = o.neighborhood_id
  LEFT JOIN LATERAL (
    SELECT v.applied_at, v.next_dose_at
    FROM vaccinations v
    WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
    ORDER BY v.applied_at DESC
    LIMIT 1
  ) rv ON true
  WHERE p.id = ANY(v_ids)
  ORDER BY p.name ASC, p.id ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

COMMENT ON FUNCTION municipality_census_export IS
  'Exportación masiva del padrón filtrado. Siempre escribe "census_export" en '
  'municipality_census_access_log con los filtros y la cantidad exacta de filas, '
  'incluso en cero. EXECUTE otorgado a authenticated en esta misma migración.';

-- ============================================================================
-- PERMISOS — la llave que gira
--
-- Vuelve ejecutables las dos funciones que la 022 dejó con el EXECUTE
-- revocado. Antes de esta línea, `authenticated` recibe "permission denied
-- for function" sin que el cuerpo corra. Después, corre — con el INSERT de
-- arriba ya en el cuerpo. No hay versión intermedia con el GRANT sin el
-- INSERT: viven en el mismo archivo.
-- ============================================================================
GRANT EXECUTE ON FUNCTION municipality_census_record(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION municipality_census_export(JSONB) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION municipality_census_export(JSONB) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION municipality_census_record(UUID) FROM authenticated;
-- DROP POLICY IF EXISTS "census_access_log_select" ON municipality_census_access_log;
-- DROP TABLE IF EXISTS municipality_census_access_log CASCADE;
--
-- El REVOKE va antes que el DROP TABLE: si la tabla se borrara primero, las
-- funciones —que todavía tendrían este INSERT en su cuerpo— fallarían contra
-- una tabla inexistente en vez de "permission denied for function". Revocando
-- antes, la reversión deja el sistema en el estado exacto de la 022.
