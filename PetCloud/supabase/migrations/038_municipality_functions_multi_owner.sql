-- ============================================================================
-- PetCloud — Migración 038: las funciones municipales cuentan a cada codueño
--
-- Las 9 funciones municipales (022/023/027/028) determinan la jurisdicción de
-- una mascota con `JOIN profiles o ON o.id = p.owner_id` — solo miran a
-- `pets.owner_id`. Con dueños N:N (034/035) eso ya no es la lista completa: si
-- el owner_id vive en Rafaela pero un codueño vive en Sunchales, la mascota
-- nunca aparecía en el padrón de Sunchales, contradiciendo la decisión de
-- producto ya tomada: una mascota cuenta en el municipio de CADA codueño.
--
-- El reemplazo, igual en las 9: un LATERAL con LIMIT 1 en vez de un JOIN
-- liso.
--
--   JOIN LATERAL (
--     SELECT o.*
--     FROM pet_shared_access psa
--     JOIN profiles o ON o.id = psa.shared_with_id
--     WHERE psa.pet_id = p.id
--       AND psa.permission = 'owner'
--       AND o.municipality_id = my_municipality_id()
--     ORDER BY (psa.shared_with_id = p.owner_id) DESC, psa.created_at ASC
--     LIMIT 1
--   ) o ON true
--
-- Por qué LATERAL y no un JOIN + DISTINCT: si dos codueños de la misma
-- mascota viven en el mismo municipio, un JOIN liso la duplicaría en los
-- listados y la contaría dos veces en los conteos. `LIMIT 1` garantiza cero o
-- una fila por mascota — nunca duplica — y de paso resuelve a QUIÉN mostrarle
-- como dueño en census_record/export: se prefiere a pets.owner_id si él
-- mismo vive en este municipio (mismo criterio de "dueño principal" que ya
-- usa el resto del producto), y si no, al codueño más antiguo
-- (`created_at ASC`) — determinístico, no el primero que devuelva la base al
-- azar.
--
-- Nada más cambia: mismos filtros, misma paginación, mismo cálculo de
-- rabies_status, misma auditoría, mismos permisos (GRANT ya existente, no se
-- toca). Solo se reemplaza CREATE OR REPLACE FUNCTION, ninguna tabla ni
-- política de RLS se modifica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- municipality_census_page (022)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION municipality_census_page(p_filters JSONB DEFAULT '{}'::jsonb)
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
  neighborhood_id UUID,
  neighborhood_name TEXT,
  rabies_status TEXT
) AS $$
DECLARE
  v_filters JSONB := COALESCE(p_filters, '{}'::jsonb);
  v_limit INT := LEAST(GREATEST(COALESCE((v_filters->>'limit')::int, 50), 1), 200);
  v_offset INT := GREATEST(COALESCE((v_filters->>'offset')::int, 0), 0);
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH censo AS (
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
      o.neighborhood_id,
      n.name AS neighborhood_name,
      CASE
        WHEN rv.applied_at IS NULL THEN 'sin-datos'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          < CURRENT_DATE THEN 'vencida'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          <= CURRENT_DATE + INTERVAL '30 days' THEN 'por-vencer'
        ELSE 'al-dia'
      END AS rabies_status
    FROM pets p
    JOIN LATERAL (
      SELECT o.*
      FROM pet_shared_access psa
      JOIN profiles o ON o.id = psa.shared_with_id
      WHERE psa.pet_id = p.id
        AND psa.permission = 'owner'
        AND o.municipality_id = my_municipality_id()
      ORDER BY (psa.shared_with_id = p.owner_id) DESC, psa.created_at ASC
      LIMIT 1
    ) o ON true
    LEFT JOIN municipality_neighborhoods n ON n.id = o.neighborhood_id
    LEFT JOIN LATERAL (
      SELECT v.applied_at, v.next_dose_at
      FROM vaccinations v
      WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      ORDER BY v.applied_at DESC
      LIMIT 1
    ) rv ON true
  )
  SELECT censo.id, censo.municipal_registry_number, censo.name, censo.species,
         censo.breed, censo.sex, censo.date_of_birth, censo.neutered, censo.color,
         censo.neighborhood_id, censo.neighborhood_name, censo.rabies_status
  FROM censo
  WHERE (NULLIF(v_filters->>'search', '') IS NULL
         OR censo.name ILIKE '%' || (v_filters->>'search') || '%'
         OR censo.municipal_registry_number ILIKE '%' || (v_filters->>'search') || '%')
    AND (NULLIF(v_filters->>'species', '') IS NULL
         OR censo.species = (v_filters->>'species')::pet_species)
    AND (NULLIF(v_filters->>'neighborhood_id', '') IS NULL
         OR censo.neighborhood_id = (v_filters->>'neighborhood_id')::uuid)
    AND (NULLIF(v_filters->>'rabies_status', '') IS NULL
         OR censo.rabies_status = (v_filters->>'rabies_status'))
  ORDER BY censo.name ASC, censo.id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- municipality_census_record (023 — versión vigente, con auditoría)
-- ----------------------------------------------------------------------------
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
    u.email::TEXT AS owner_email
  INTO v_row
  FROM pets p
  JOIN LATERAL (
    SELECT o.*
    FROM pet_shared_access psa
    JOIN profiles o ON o.id = psa.shared_with_id
    WHERE psa.pet_id = p.id
      AND psa.permission = 'owner'
      AND o.municipality_id = my_municipality_id()
    ORDER BY (psa.shared_with_id = p.owner_id) DESC, psa.created_at ASC
    LIMIT 1
  ) o ON true
  JOIN auth.users u ON u.id = o.id
  LEFT JOIN municipality_neighborhoods n ON n.id = o.neighborhood_id
  LEFT JOIN LATERAL (
    SELECT v.applied_at, v.next_dose_at
    FROM vaccinations v
    WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
    ORDER BY v.applied_at DESC
    LIMIT 1
  ) rv ON true
  WHERE p.id = p_pet_id;

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

-- ----------------------------------------------------------------------------
-- municipality_census_export (023 — versión vigente, con auditoría)
-- ----------------------------------------------------------------------------
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
    JOIN LATERAL (
      SELECT o.*
      FROM pet_shared_access psa
      JOIN profiles o ON o.id = psa.shared_with_id
      WHERE psa.pet_id = p.id
        AND psa.permission = 'owner'
        AND o.municipality_id = my_municipality_id()
      ORDER BY (psa.shared_with_id = p.owner_id) DESC, psa.created_at ASC
      LIMIT 1
    ) o ON true
    LEFT JOIN LATERAL (
      SELECT v.applied_at, v.next_dose_at
      FROM vaccinations v
      WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      ORDER BY v.applied_at DESC
      LIMIT 1
    ) rv ON true
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
    u.email::TEXT AS owner_email
  FROM pets p
  JOIN LATERAL (
    SELECT o.*
    FROM pet_shared_access psa
    JOIN profiles o ON o.id = psa.shared_with_id
    WHERE psa.pet_id = p.id
      AND psa.permission = 'owner'
      AND o.municipality_id = my_municipality_id()
    ORDER BY (psa.shared_with_id = p.owner_id) DESC, psa.created_at ASC
    LIMIT 1
  ) o ON true
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

-- ----------------------------------------------------------------------------
-- municipality_campaign_history_for_pet (027)
--
-- No devuelve ningún dato de dueño: solo hace falta saber SI existe algún
-- codueño en este municipio, no cuál. `EXISTS` alcanza, sin necesitar LATERAL
-- ni preferir a nadie por sobre nadie — no hay a quién "mostrarle" acá.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION municipality_campaign_history_for_pet(p_pet_id UUID)
RETURNS TABLE (
  campaign_id UUID,
  campaign_name TEXT,
  applied_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS campaign_id,
    c.name AS campaign_name,
    v.applied_at::TIMESTAMPTZ AS applied_at
  FROM vaccinations v
  JOIN pets p ON p.id = v.pet_id
  JOIN campaigns c ON c.id = v.campaign_id
  WHERE v.pet_id = p_pet_id
    AND EXISTS (
      SELECT 1
      FROM pet_shared_access psa
      JOIN profiles o ON o.id = psa.shared_with_id
      WHERE psa.pet_id = p.id
        AND psa.permission = 'owner'
        AND o.municipality_id = my_municipality_id()
    )
  ORDER BY v.applied_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- municipality_panel_metrics (028)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION municipality_panel_metrics()
RETURNS TABLE (
  registradas INT,
  cobertura NUMERIC,
  vencidas INT,
  dosis_del_mes INT
) AS $$
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH censo AS (
    SELECT
      p.id,
      CASE
        WHEN rv.applied_at IS NULL THEN 'sin-datos'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          < CURRENT_DATE THEN 'vencida'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          <= CURRENT_DATE + INTERVAL '30 days' THEN 'por-vencer'
        ELSE 'al-dia'
      END AS rabies_status
    FROM pets p
    JOIN LATERAL (
      SELECT o.*
      FROM pet_shared_access psa
      JOIN profiles o ON o.id = psa.shared_with_id
      WHERE psa.pet_id = p.id
        AND psa.permission = 'owner'
        AND o.municipality_id = my_municipality_id()
      ORDER BY (psa.shared_with_id = p.owner_id) DESC, psa.created_at ASC
      LIMIT 1
    ) o ON true
    LEFT JOIN LATERAL (
      SELECT v.applied_at, v.next_dose_at
      FROM vaccinations v
      WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      ORDER BY v.applied_at DESC
      LIMIT 1
    ) rv ON true
  ),
  dosis_mes AS (
    SELECT COUNT(*) AS n
    FROM vaccinations v
    JOIN pets p ON p.id = v.pet_id
    WHERE EXISTS (
        SELECT 1
        FROM pet_shared_access psa
        JOIN profiles o ON o.id = psa.shared_with_id
        WHERE psa.pet_id = p.id
          AND psa.permission = 'owner'
          AND o.municipality_id = my_municipality_id()
      )
      AND v.verified
      AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      AND date_trunc('month', v.applied_at) = date_trunc('month', CURRENT_DATE)
  )
  SELECT
    COUNT(*)::int AS registradas,
    CASE WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE censo.rabies_status = 'al-dia') / COUNT(*), 1)
    END AS cobertura,
    COUNT(*) FILTER (WHERE censo.rabies_status = 'vencida')::int AS vencidas,
    (SELECT n FROM dosis_mes)::int AS dosis_del_mes
  FROM censo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- municipality_coverage_by_neighborhood (028)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION municipality_coverage_by_neighborhood()
RETURNS TABLE (
  neighborhood_id UUID,
  neighborhood_name TEXT,
  registradas INT,
  al_dia INT,
  cobertura NUMERIC
) AS $$
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH censo AS (
    SELECT
      p.id,
      o.neighborhood_id,
      CASE
        WHEN rv.applied_at IS NULL THEN 'sin-datos'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          < CURRENT_DATE THEN 'vencida'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          <= CURRENT_DATE + INTERVAL '30 days' THEN 'por-vencer'
        ELSE 'al-dia'
      END AS rabies_status
    FROM pets p
    JOIN LATERAL (
      SELECT o.*
      FROM pet_shared_access psa
      JOIN profiles o ON o.id = psa.shared_with_id
      WHERE psa.pet_id = p.id
        AND psa.permission = 'owner'
        AND o.municipality_id = my_municipality_id()
      ORDER BY (psa.shared_with_id = p.owner_id) DESC, psa.created_at ASC
      LIMIT 1
    ) o ON true
    LEFT JOIN LATERAL (
      SELECT v.applied_at, v.next_dose_at
      FROM vaccinations v
      WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      ORDER BY v.applied_at DESC
      LIMIT 1
    ) rv ON true
  )
  SELECT
    n.id AS neighborhood_id,
    n.name AS neighborhood_name,
    COUNT(censo.id)::int AS registradas,
    COUNT(censo.id) FILTER (WHERE censo.rabies_status = 'al-dia')::int AS al_dia,
    CASE WHEN COUNT(censo.id) = 0 THEN 0
      ELSE ROUND(100.0 * COUNT(censo.id) FILTER (WHERE censo.rabies_status = 'al-dia')
        / COUNT(censo.id), 1)
    END AS cobertura
  FROM municipality_neighborhoods n
  JOIN censo ON censo.neighborhood_id = n.id
  WHERE n.municipality_id = my_municipality_id()
  GROUP BY n.id, n.name
  ORDER BY n.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- municipality_monthly_registrations (028)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION municipality_monthly_registrations()
RETURNS TABLE (
  mes DATE,
  altas INT,
  acumulado INT
) AS $$
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
      date_trunc('month', CURRENT_DATE),
      INTERVAL '1 month'
    )::date AS mes
  ),
  mis_mascotas AS (
    SELECT p.id, p.created_at
    FROM pets p
    WHERE EXISTS (
      SELECT 1
      FROM pet_shared_access psa
      JOIN profiles o ON o.id = psa.shared_with_id
      WHERE psa.pet_id = p.id
        AND psa.permission = 'owner'
        AND o.municipality_id = my_municipality_id()
    )
  )
  SELECT
    meses.mes,
    COUNT(mm.id) FILTER (
      WHERE date_trunc('month', mm.created_at) = meses.mes
    )::int AS altas,
    (
      SELECT COUNT(*)::int
      FROM mis_mascotas mm2
      WHERE mm2.created_at < meses.mes + INTERVAL '1 month'
    ) AS acumulado
  FROM meses
  LEFT JOIN mis_mascotas mm ON date_trunc('month', mm.created_at) = meses.mes
  GROUP BY meses.mes
  ORDER BY meses.mes ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- municipality_species_distribution (028)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION municipality_species_distribution()
RETURNS TABLE (
  species pet_species,
  cantidad INT
) AS $$
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT p.species, COUNT(*)::int AS cantidad
  FROM pets p
  WHERE EXISTS (
    SELECT 1
    FROM pet_shared_access psa
    JOIN profiles o ON o.id = psa.shared_with_id
    WHERE psa.pet_id = p.id
      AND psa.permission = 'owner'
      AND o.municipality_id = my_municipality_id()
  )
  GROUP BY p.species
  ORDER BY cantidad DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- municipality_heatmap_cells (028)
--
-- Estructura distinta a las demás: arrancaba de `municipality_neighborhoods`
-- y bajaba a `profiles` y de ahí a `pets` (`p.owner_id = o.id`). Con N:N esa
-- dirección no alcanza: un LEFT JOIN de barrio a perfiles no puede, por sí
-- solo, elegir "el" codueño representante de una mascota con varios. Se
-- invierte a "por cada mascota con algún codueño en este municipio, calculá
-- su barrio representante" (mismo criterio LATERAL que el resto) y recién
-- ahí se cuenta por barrio — la grilla barrio × mes y el LEFT JOIN que deja
-- ver barrios en cero no cambian.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION municipality_heatmap_cells()
RETURNS TABLE (
  neighborhood_id UUID,
  neighborhood_name TEXT,
  mes DATE,
  cantidad INT
) AS $$
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
      date_trunc('month', CURRENT_DATE),
      INTERVAL '1 month'
    )::date AS mes
  ),
  mis_mascotas AS (
    SELECT p.id AS pet_id, p.created_at, o.neighborhood_id
    FROM pets p
    JOIN LATERAL (
      SELECT prof.neighborhood_id
      FROM pet_shared_access psa
      JOIN profiles prof ON prof.id = psa.shared_with_id
      WHERE psa.pet_id = p.id
        AND psa.permission = 'owner'
        AND prof.municipality_id = my_municipality_id()
      ORDER BY (psa.shared_with_id = p.owner_id) DESC, psa.created_at ASC
      LIMIT 1
    ) o ON true
  )
  SELECT
    n.id AS neighborhood_id,
    n.name AS neighborhood_name,
    meses.mes,
    COUNT(mm.pet_id) FILTER (
      WHERE date_trunc('month', mm.created_at) = meses.mes
    )::int AS cantidad
  FROM municipality_neighborhoods n
  CROSS JOIN meses
  LEFT JOIN mis_mascotas mm ON mm.neighborhood_id = n.id
  WHERE n.municipality_id = my_municipality_id()
  GROUP BY n.id, n.name, meses.mes
  ORDER BY n.name ASC, meses.mes ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- No hay sección de PERMISOS: las 9 funciones ya tienen su GRANT EXECUTE
-- otorgado desde 022/023/027/028, y CREATE OR REPLACE FUNCTION no lo toca.

-- ROLLBACK
-- No es prático volver al JOIN viejo con un solo DROP: revertir significa
-- volver a correr el cuerpo de cada función tal como estaba en su migración
-- original (022 para census_page, 023 para census_record/export, 027 para
-- campaign_history, 028 para las cinco de métricas) con CREATE OR REPLACE
-- FUNCTION otra vez.
