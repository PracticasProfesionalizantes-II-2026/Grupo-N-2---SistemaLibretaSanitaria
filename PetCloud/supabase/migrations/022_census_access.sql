-- ============================================================================
-- PetCloud — Migración 022: la única puerta al padrón
--
-- Hasta acá ninguna política de RLS le da al rol `municipality` un SELECT
-- sobre `profiles`, ni sobre `pets` que no sea suya. Esta migración no cambia
-- eso — lo confirma. Nombre, domicilio, teléfono y correo de un vecino salen
-- del sistema por exactamente tres funciones `SECURITY DEFINER`, nunca por
-- una fila leída directamente. Sin estas funciones un municipio no tiene
-- ningún camino a los datos de nadie; con ellas, tiene exactamente el que
-- esta migración escribe.
--
-- Las tres filtran siempre por `profiles.municipality_id =
-- my_municipality_id()`. La jurisdicción nunca es un parámetro — ninguna
-- firma acá recibe un municipio elegido por quien llama; `my_municipality_id()`
-- (017) decide a partir de `auth.uid()`, y eso es lo único que impide que un
-- municipio lea el padrón de otro. `is_validated_municipality()` (017) es la
-- primera línea de las tres: sin validar, ERROR, nunca una lista vacía —
-- confundir las dos cosas escondería el estado real de la cuenta.
--
-- `municipality_census_page` no expone ninguna columna de `profiles`: solo
-- datos de la mascota. Por eso no se audita —hojear nombres no es un acceso a
-- datos personales— y por eso tampoco lleva `qr_code`: el código del collar
-- reidentifica fuera del padrón, y esa vía queda reservada a la ficha
-- completa, que sí se asienta.
--
-- `municipality_census_record` y `municipality_census_export` sí exponen
-- datos del dueño (`first_name`, `last_name`, `phone`, `address`, y el correo
-- de `auth.users`) y por eso nacen con el `EXECUTE` revocado: se habilitan
-- recién en la 023, junto con la tabla de auditoría y el INSERT que deja
-- registrado quién consultó qué. Publicarlas ejecutables ahora sería exponer
-- datos personales sin rastro de quién los vio — el hueco que esta fase
-- existe para cerrar. El `REVOKE` es el mecanismo real: revocado, nadie las
-- llama. El chequeo de `to_regclass` de adentro es la segunda barrera, para
-- si alguien otorga el `EXECUTE` a mano sin correr la 023: corta antes de
-- tocar una fila de `profiles`, en vez de devolver datos sin auditoría.
--
-- Nunca expuestas, validado o no: `medical_records`, `conditions`,
-- `medications`, `dewormings`, `weight_records`, `pet_documents`,
-- `pet_notes`, `visits`. De `vaccinations` solo la fecha, el nombre de la
-- vacuna y `verified` — lo justo para el estado antirrábico, nunca el cuadro
-- clínico. Ningún DNI: la columna no existe en `profiles` y no se crea acá.
-- ============================================================================

-- `unaccent`: probado a mano, `vaccine_name ILIKE '%rabi%'` NO matchea
-- "Antirrábica" — la tilde corta la subcadena plana "rabi" justo donde la 017
-- sembró esa grafía como primera de `alias_patrones` — así que sin normalizar
-- el estado antirrábico daría "sin-datos" a la grafía correcta.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Solo dosis verificadas cuentan para el municipio (002). El predicado de
-- texto queda fuera del índice porque `unaccent()` es STABLE y Postgres exige
-- inmutabilidad en el WHERE de un índice parcial; alcanza con `verified`, ya
-- que las dosis por mascota son pocas.
CREATE INDEX IF NOT EXISTS idx_vaccinations_pet_verified_rabia
  ON vaccinations (pet_id, applied_at DESC)
  WHERE verified;

-- ----------------------------------------------------------------------------
-- municipality_census_page — el listado
--
-- Filtros, todos opcionales, como un único JSONB en vez de media docena de
-- parámetros posicionales — así la 023 y las que sigan pueden sumar un filtro
-- sin tocar la firma:
--   search           TEXT  — coincide contra el nombre o el Nº de registro
--   species          TEXT  — 'dog' | 'cat' | 'other' (pet_species)
--   neighborhood_id  UUID  — barrio declarado por el dueño
--   rabies_status    TEXT  — 'al-dia' | 'por-vencer' | 'vencida' | 'sin-datos'
--   limit / offset   INT   — paginación; el máximo se acota a 200 por página
--
-- La heurística `unaccent(vaccine_name) ILIKE '%rabi%'` sigue siendo
-- imprecisa a propósito — matchea "Antirrábica"/"Antirrabica"/"Rabia" y nada
-- que una veterinaria haya tipeado distinto. Es la misma limitación que el
-- diseño deja anotada como pregunta abierta: un catálogo de vacunas que sepa
-- cuál es la obligatoria es una fase aparte.
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
    JOIN profiles o ON o.id = p.owner_id
    LEFT JOIN municipality_neighborhoods n ON n.id = o.neighborhood_id
    LEFT JOIN LATERAL (
      SELECT v.applied_at, v.next_dose_at
      FROM vaccinations v
      WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      ORDER BY v.applied_at DESC
      LIMIT 1
    ) rv ON true
    WHERE o.municipality_id = my_municipality_id()
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

COMMENT ON FUNCTION municipality_census_page IS
  'Listado del padrón, sin ningún dato personal del dueño. No se audita: '
  'hojear nombres de mascotas no es un acceso a datos personales. Habilitada '
  'para readonly/operator/admin en esta misma migración.';

-- ----------------------------------------------------------------------------
-- municipality_census_record — la ficha completa de una mascota
--
-- Todo lo del listado más los datos del dueño y `qr_code`. Nace con el
-- `EXECUTE` revocado: llamarla hoy, desde cualquier rol, termina en
-- "permission denied for function" antes de que el cuerpo corra una sola
-- línea. El chequeo de `to_regclass` de acá adentro es la segunda barrera,
-- para el caso en que alguien otorgue el `EXECUTE` a mano sin haber corrido la
-- 023 — entonces corta con un error igual de explícito, sin devolver una
-- fila. La 023 es la que agrega el INSERT en el registro de auditoría antes
-- del RETURN y la que vuelve a otorgar el `EXECUTE`.
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

  -- Acá, en la 023, se agrega el INSERT ('record_view') antes de este RETURN.
  RETURN QUERY
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
    o.first_name,
    o.last_name,
    o.phone,
    o.address,
    u.email
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

COMMENT ON FUNCTION municipality_census_record IS
  'Ficha completa de una mascota, con los datos del dueño. PII: nace con el '
  'EXECUTE revocado hasta la 023, que agrega el INSERT de auditoría y vuelve '
  'a otorgarlo.';

-- ----------------------------------------------------------------------------
-- municipality_census_export — la ficha completa, para un conjunto filtrado
--
-- Mismas columnas que municipality_census_record, mismos filtros que
-- municipality_census_page — decisión asentada del proyecto (ronda de
-- preguntas): las tres jerarquías (readonly, operator, admin) pueden
-- exportar. Sin paginación: la exportación trae siempre el conjunto filtrado
-- completo, porque es de ahí de donde sale el `record_count` que la 023 va a
-- auditar. Misma puerta cerrada que la ficha: nace con el EXECUTE revocado.
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

  -- Acá, en la 023, se agrega el INSERT ('census_export', con filtros y
  -- cantidad de filas) antes de este RETURN.
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
      u.email AS owner_email
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
    WHERE o.municipality_id = my_municipality_id()
  )
  SELECT censo.id, censo.municipal_registry_number, censo.name, censo.species,
         censo.breed, censo.sex, censo.date_of_birth, censo.neutered, censo.color,
         censo.qr_code, censo.neighborhood_id, censo.neighborhood_name,
         censo.rabies_status, censo.owner_first_name, censo.owner_last_name,
         censo.owner_phone, censo.owner_address, censo.owner_email
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
  ORDER BY censo.name ASC, censo.id ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

COMMENT ON FUNCTION municipality_census_export IS
  'Exportación masiva del padrón filtrado, mismas columnas que la ficha. PII: '
  'nace con el EXECUTE revocado hasta la 023.';

-- ============================================================================
-- PERMISOS
--
-- El listado no expone ningún dato personal: se habilita en esta misma
-- migración para el rol `authenticated` (la puerta de entrada real sigue
-- siendo `is_validated_municipality()`, que rechaza a quien no sea personal
-- municipal validado). Ficha y exportación sí exponen datos personales: se
-- revoca explícitamente de `PUBLIC`, `anon` y `authenticated` — los tres,
-- porque las políticas por defecto de este proyecto (ver `supabase/seed.sql`)
-- otorgan `EXECUTE` a los tres de forma ambiente en cuanto la función se crea,
-- y revocar solo de `PUBLIC` dejaría en pie el otorgamiento nombrado a
-- `authenticated`. Nadie puede ejecutarlas hasta que la 023 vuelva a
-- otorgarlas. `service_role` no se toca: es el que corren las herramientas del
-- propio equipo de PetCloud.
-- ============================================================================
GRANT EXECUTE ON FUNCTION municipality_census_page(JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION municipality_census_record(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION municipality_census_export(JSONB)
  FROM PUBLIC, anon, authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS municipality_census_export(JSONB);
-- DROP FUNCTION IF EXISTS municipality_census_record(UUID);
-- DROP FUNCTION IF EXISTS municipality_census_page(JSONB);
-- DROP INDEX IF EXISTS idx_vaccinations_pet_verified_rabia;
-- DROP EXTENSION IF EXISTS unaccent;
--
-- Adición pura. Sin estas funciones el municipio vuelve a no tener ningún
-- camino a los datos del vecino, que es el estado por defecto del esquema.
