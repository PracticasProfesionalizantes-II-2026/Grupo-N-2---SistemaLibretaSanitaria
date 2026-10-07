-- ============================================================================
-- PetCloud — Migración 055: directorio cercano de veterinarias con guardia en
-- vivo
--
-- Hoy `vet_institutions` se lee entera con `USING (true)` (001:221-223): un
-- dueño no puede saber cuáles clínicas están validadas antes de elegir una, y
-- no existe ningún cálculo de distancia. Esta migración agrega coordenadas y
-- un índice parcial a `vet_institutions`, un booleano de guardia a
-- `vet_professionals`, **reemplaza** la política abierta de SELECT por una con
-- cuatro ramas, extiende la guarda de privilegios de la 019 para cubrir la
-- guardia, y agrega una función de búsqueda `SECURITY INVOKER`.
--
-- ----------------------------------------------------------------------------
-- Por qué el reemplazo de la política va por bloque DO y no por nombre literal
-- ----------------------------------------------------------------------------
--
-- Las políticas de RLS se combinan con OR. Un `DROP POLICY IF EXISTS "Anyone
-- can read vet institutions"` que no matchea en algún entorno no falla: no
-- dropea nada, la política nueva queda **al lado** de la vieja, y la tabla
-- sigue siendo legible por cualquiera porque `USING (true)` gana la OR contra
-- cualquier otra condición. El historial de migraciones diría que la tabla
-- quedó hardened; la realidad sería la contraria. Es la misma lección que la
-- 051 aplicó a un CHECK, acá aplicada a una política.
--
-- El bloque de abajo busca en `pg_policies` la política de SELECT sobre
-- `vet_institutions` cuyo predicado (`qual`) es literalmente `true`, y
-- **aborta con RAISE EXCEPTION si no encuentra exactamente una**. El nombre
-- literal ("Anyone can read vet institutions", verificado carácter por
-- carácter en 001:221) es evidencia de una sola base; lo que no puede variar
-- entre entornos es qué hace la política, no cómo se llama.
--
-- ----------------------------------------------------------------------------
-- Las cuatro ramas de la política nueva
-- ----------------------------------------------------------------------------
--
-- Cada rama tiene un consumidor real, verificado antes de escribir esta
-- migración:
--
--   · `validated = true`               — el caso general: el directorio y
--     cualquier lectura pública solo ven clínicas ya validadas.
--   · `is_institution_member(id)`       — (040:26) para que `vet-session.ts`,
--     el panel de espera y el resto de las pantallas de un profesional sigan
--     viendo su propia institución mientras está pendiente de validación.
--   · `is_platform_admin()`             — (039:24) para que el backoffice siga
--     listando todo, validado o no.
--   · `my_municipality_id() IS NOT NULL` — (017:141) para que un municipio
--     pueda armar su lista de clínicas invitables
--     (`municipality/data/clinics.ts:170`), que por definición incluye
--     clínicas todavía sin validar.
--
-- Sacar cualquiera de las cuatro rompe en silencio a su consumidor, porque un
-- embed denegado por RLS vuelve `null`, no un error.
--
-- ----------------------------------------------------------------------------
-- La guarda de `on_call` va por CREATE OR REPLACE, nunca editando la 019
-- ----------------------------------------------------------------------------
--
-- `019_protect_vet_privileges.sql` es append-only. El trigger de esa
-- migración (`vet_professionals_protect_privileges`, 019:67-69) referencia la
-- función `protect_vet_privileges()` por nombre, así que reemplazar el cuerpo
-- con `CREATE OR REPLACE FUNCTION` alcanza — no hace falta tocar el trigger.
-- El cuerpo se restata completo porque `CREATE OR REPLACE` sustituye toda la
-- función; achicarlo a solo el `IF` nuevo perdería las tres guardas
-- originales (`license_validated`, `license_number`, `role_in_institution`) y
-- abriría tres agujeros por cerrar uno.
--
-- La regla nueva: si `on_call` pasa a `true` y `license_validated` es
-- `false`, se revierte a `false` en silencio, mismo patrón que las tres
-- guardas de arriba y que `protect_municipality_validation` (017) — un UPDATE
-- que toca varias columnas guarda las legítimas y descarta la que no
-- corresponde.
--
-- El trigger de la 019 es `BEFORE UPDATE` únicamente (019:67-69), así que un
-- INSERT con `on_call = true` lo esquiva por completo. Ese es el agujero
-- real: por eso esta migración agrega un segundo trigger, `BEFORE INSERT`,
-- con una función deliberadamente chica que no puede reutilizar
-- `protect_vet_privileges()` porque esa lee `OLD`, que no existe en un
-- INSERT.
--
-- ----------------------------------------------------------------------------
-- El agujero durmiente que esta guarda mitiga (no cierra)
-- ----------------------------------------------------------------------------
--
-- Verificado, y no lo crea esta migración: ni la política de INSERT
-- ("Users can create own vet professional record", 001:246-249) ni la de
-- UPDATE ("Vet professionals can update own record", 001:251-254) de
-- `vet_professionals` restringen `institution_id`. Cualquier cuenta puede
-- insertar (o mover) su propia fila de profesional apuntando a la
-- institución que quiera. Hoy eso es deuda dormida porque `license_validated`
-- nace en `false` (001:180) y los paneles bloquean sobre ese dato. El
-- directorio es una superficie nueva donde, sin filtro, cualquiera podría
-- autoproclamarse guardia de una clínica validada ajena, con el nombre de esa
-- clínica al lado del suyo.
--
-- Dos mitigaciones, ambas en esta migración: (a) la función de búsqueda
-- cuenta y nombra solo profesionales con `license_validated = true`; (b) los
-- dos triggers de arriba impiden que `on_call` llegue a `true` sin matrícula
-- validada, por UPDATE o por INSERT. Cerrar el agujero de `institution_id`
-- de raíz implica reescribir las políticas de INSERT/UPDATE de una tabla que
-- media plataforma lee y escribe — queda fuera de esta migración, filado como
-- cambio propio.
--
-- ----------------------------------------------------------------------------
-- Por qué la función de búsqueda es SECURITY INVOKER, no DEFINER
-- ----------------------------------------------------------------------------
--
-- `seed.sql:22-28` otorga `EXECUTE ON ALL FUNCTIONS` a `anon` (y los default
-- privileges de la nube hacen lo mismo). Una función DEFINER nueva nace
-- invocable por cualquiera que tenga la anon key, y correría con RLS
-- salteada por dentro — exactamente el mismo motivo que descartó DEFINER en
-- la 054. Con INVOKER ese grant queda inerte: el cuerpo corre como quien
-- llama, y la política de arriba sigue ocultando las filas que corresponde.
--
-- El origen geográfico se resuelve DENTRO de la función, desde `auth.uid()`
-- → `profiles.municipality_id` → `municipalities.center_*`. Nunca se acepta
-- lat/lng por parámetro: eso convertiría la función en un escáner geográfico
-- libre sobre cualquier institución validada.
--
-- El radio terrestre es 6371 km, el mismo que ya usa `src/lib/geo.ts:22-23`,
-- para que la clasificación del servidor y cualquier re-cálculo del cliente
-- no difieran ni un metro visible.
--
-- Prefiltro por caja antes de Haversine: una expresión Haversine sobre
-- argumentos derivados de `auth.uid()` no es IMMUTABLE y no se puede indexar.
-- La caja sí son dos predicados de rango planos, que el índice parcial de
-- abajo sirve; Haversine corre después, solo sobre las filas que sobreviven
-- al prefiltro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A.1.1 — coordenadas en vet_institutions
-- ----------------------------------------------------------------------------
ALTER TABLE vet_institutions
  ADD COLUMN latitude  NUMERIC(9,6),
  ADD COLUMN longitude NUMERIC(9,6),
  ADD CONSTRAINT vet_institutions_latitude_rango
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT vet_institutions_longitude_rango
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT vet_institutions_coordenadas_completas
    CHECK ((latitude IS NULL) = (longitude IS NULL));

-- Parcial a propósito: el directorio solo recorre validadas con coordenadas,
-- y ese es hoy un subconjunto chico de la tabla. El índice pesa lo que pesa
-- ese subconjunto, no la tabla entera. Solo `latitude` encabeza el
-- compuesto, así que `longitude` se aplica como filtro del índice y no como
-- una segunda búsqueda de rango — aceptado porque la latitud sola ya recorta
-- el candidato a una banda horizontal de pocos kilómetros de alto.
CREATE INDEX idx_vet_institutions_coordenadas
  ON vet_institutions(latitude, longitude)
  WHERE validated AND latitude IS NOT NULL;

-- ----------------------------------------------------------------------------
-- A.1.2 — guardia en vet_professionals
-- ----------------------------------------------------------------------------
ALTER TABLE vet_professionals
  ADD COLUMN on_call BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_vet_professionals_guardia
  ON vet_professionals(institution_id)
  WHERE on_call;

-- ----------------------------------------------------------------------------
-- A.1.3 — resolver y eliminar la política abierta, por definición
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_nombre TEXT;
  v_cuantos INTEGER;
BEGIN
  SELECT count(*), min(policyname) INTO v_cuantos, v_nombre
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'vet_institutions'
    AND cmd = 'SELECT'
    AND qual = 'true';

  IF v_cuantos <> 1 THEN
    RAISE EXCEPTION
      'Migración 055: se esperaba exactamente 1 política SELECT con USING (true) '
      'sobre vet_institutions (la de la 001) y se encontraron %. Las políticas se '
      'combinan con OR: dejar la vieja al lado de la nueva mantiene la tabla '
      'abierta con el historial diciendo lo contrario.', v_cuantos;
  END IF;

  EXECUTE format('DROP POLICY %I ON public.vet_institutions', v_nombre);
  RAISE NOTICE 'Migración 055: se eliminó la política "%" de la 001.', v_nombre;
END;
$$;

-- ----------------------------------------------------------------------------
-- A.1.4 — la política nueva, de cuatro ramas
-- ----------------------------------------------------------------------------
CREATE POLICY "vet_institutions_select" ON vet_institutions FOR SELECT
  USING (
    validated = true
    OR is_institution_member(id)         -- 040:26
    OR is_platform_admin()               -- 039:24
    OR my_municipality_id() IS NOT NULL  -- 017:141 (la 038 la usa, no la define)
  );

-- ----------------------------------------------------------------------------
-- A.1.5 — protect_vet_privileges(): las tres guardas de la 019, restatadas,
-- más la cuarta que cierra el UPDATE de la guardia sin matrícula validada
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_vet_privileges()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- La validación de la matrícula la hace el equipo de PetCloud, nunca la
  -- persona validada.
  IF NEW.license_validated IS DISTINCT FROM OLD.license_validated THEN
    NEW.license_validated := OLD.license_validated;
  END IF;

  -- Corregir el número está bien hasta que alguien lo haya revisado.
  IF OLD.license_validated
     AND NEW.license_number IS DISTINCT FROM OLD.license_number
  THEN
    NEW.license_number := OLD.license_number;
  END IF;

  -- Quién manda en la veterinaria no se decide desde la propia fila.
  IF NEW.role_in_institution IS DISTINCT FROM OLD.role_in_institution THEN
    NEW.role_in_institution := OLD.role_in_institution;
  END IF;

  -- Guardia sin matrícula validada no existe. Se revierte en silencio, igual
  -- que las tres de arriba y que `protect_municipality_validation` (017): un
  -- UPDATE que toca varias columnas guarda las legítimas y descarta la que no
  -- corresponde, sin que la pantalla tenga que distinguir. Una excepción acá
  -- rompería el guardado de teléfono o especialidad de alguien cuya matrícula
  -- todavía está en revisión, que no hizo nada malo. El interruptor igual se
  -- muestra apagado y el directorio no lo lista: la única forma de prenderlo
  -- es que el equipo de PetCloud valide la matrícula.
  IF NEW.on_call AND NOT NEW.license_validated THEN
    NEW.on_call := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION protect_vet_privileges IS
  'Impide que un profesional se cambie a sí mismo la validación de matrícula, '
  'el número ya validado, su rol en la institución, o que prenda la guardia '
  'sin matrícula validada. Restatada por la 055 sobre el cuerpo de la 019: '
  'CREATE OR REPLACE sustituye la función entera, así que las tres guardas '
  'originales viajan sin cambios junto a la cuarta.';

-- El trigger `vet_professionals_protect_privileges` (019:67-69) ya apunta a
-- esta función por nombre — no hace falta DROP/CREATE TRIGGER.

-- ----------------------------------------------------------------------------
-- A.1.6 — guarda equivalente para el camino de INSERT, que la 019 no cubre
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guardia_requiere_matricula_al_insertar()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.on_call AND NOT NEW.license_validated THEN
    NEW.on_call := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION guardia_requiere_matricula_al_insertar IS
  'Equivalente a la cuarta guarda de protect_vet_privileges() para el INSERT: '
  'el trigger de la 019 es BEFORE UPDATE únicamente y no lo cubre, y '
  'protect_vet_privileges() no se puede reutilizar acá porque lee OLD, que no '
  'existe en un INSERT.';

CREATE TRIGGER vet_professionals_guardia_al_insertar
  BEFORE INSERT ON vet_professionals
  FOR EACH ROW EXECUTE FUNCTION guardia_requiere_matricula_al_insertar();

-- ----------------------------------------------------------------------------
-- A.1.7 — función de búsqueda cercana
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER, y eso es lo contraintuitivo: `anon` tiene EXECUTE sobre
-- todas las funciones (seed.sql:22-28), así que una DEFINER nace invocable
-- por cualquiera con la anon key y saltearía la política de arriba. Con
-- INVOKER el grant queda inerte: el cuerpo corre como quien llama.
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
         -- validada.
         EXISTS (SELECT 1 FROM vet_professionals g
                 WHERE g.institution_id = v.id
                   AND g.on_call AND g.license_validated) AS on_call,
         ARRAY(SELECT concat_ws(' ', pr.first_name, pr.last_name)
               FROM vet_professionals g
               JOIN profiles pr ON pr.id = g.profile_id
               WHERE g.institution_id = v.id
                 AND g.on_call AND g.license_validated) AS on_call_names
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
  'filtran por license_validated: ver el agujero durmiente documentado en el '
  'encabezado de esta migración.';

-- La caja es un cuadrado que circunscribe el círculo, así que admite filas de
-- esquina hasta `radius * sqrt(2)`; el valor exacto de Haversine es el que se
-- ordena, y quien llama aplica el corte circular sobre `distance_km`.
-- `v.validated` se repite en el WHERE aunque la política ya lo exige — es lo
-- que le permite al planner elegir el índice parcial, no una segunda capa de
-- seguridad.

GRANT EXECUTE ON FUNCTION vet_institutions_nearby(NUMERIC) TO authenticated;

-- ----------------------------------------------------------------------------
-- A.1.7b — el invariante de seguridad de esta migración, consultable
-- ----------------------------------------------------------------------------
-- Mismo patrón que `erp.fks_internas()` (112:540-575): una función de
-- introspección acotada, en SQL, sin `SECURITY DEFINER` porque `pg_policies`
-- y `pg_proc` ya son legibles por cualquiera que tenga acceso a la sesión —
-- no hace falta elevar nada, solo restringir quién puede invocarla.
--
-- Devuelve las dos cosas que el bloque `DO` y el `SECURITY INVOKER` de arriba
-- prometen y que ningún cliente PostgREST puede verificar por sí solo
-- (`pg_catalog` no es un esquema expuesto por la API): cuántas políticas de
-- SELECT sobre `vet_institutions` quedaron con predicado `true` después de
-- esta migración (tiene que ser 0: la única que sobrevive es
-- `vet_institutions_select`, que no es `USING (true)`), y si
-- `vet_institutions_nearby` quedó con `prosecdef = true` (DEFINER) en vez de
-- `false` (INVOKER, lo que se pidió). Una sola función para las dos preguntas
-- porque las dos son el mismo invariante — "la 055 hardened lo que dice
-- haber hardened" — y separar en dos no le agrega nada a quien la lee, salvo
-- una segunda llamada.
CREATE OR REPLACE FUNCTION vet_directorio_seguridad()
RETURNS TABLE (
  politicas_select_abiertas INTEGER,
  nombres_politicas_select TEXT[],
  busqueda_es_security_definer BOOLEAN
)
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT
    (SELECT count(*)::INTEGER FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'vet_institutions'
         AND cmd = 'SELECT'
         AND qual = 'true'),
    (SELECT coalesce(array_agg(policyname ORDER BY policyname), '{}'::TEXT[])
       FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'vet_institutions'
        AND cmd = 'SELECT'),
    (SELECT p.prosecdef FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace
         AND p.proname = 'vet_institutions_nearby');
$$;

COMMENT ON FUNCTION vet_directorio_seguridad() IS
  'Invariante de seguridad de la 055, consultable: cuántas políticas SELECT '
  'con USING (true) quedan sobre vet_institutions (tiene que ser 0 — la única '
  'sobreviviente es vet_institutions_select) y si vet_institutions_nearby es '
  'SECURITY DEFINER (tiene que ser false). La ejercita '
  'tests/rls/directorio-veterinarias.test.ts, Case 7.';

REVOKE EXECUTE ON FUNCTION vet_directorio_seguridad() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vet_directorio_seguridad() TO service_role;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Esta mitad NO es simétrica: dropear la función y las columnas nuevas es
-- seguro (nada preexistente depende de ellas), pero volver a `USING (true)`
-- sobre `vet_institutions` reabre la tabla entera y es una regresión
-- deliberada y registrada, no un rollback inocente. Preferir agregar una
-- rama nueva a `vet_institutions_select` antes que revertir la política.
--
-- REVOKE EXECUTE ON FUNCTION vet_directorio_seguridad() FROM service_role;
-- DROP FUNCTION IF EXISTS vet_directorio_seguridad();
-- REVOKE EXECUTE ON FUNCTION vet_institutions_nearby(NUMERIC) FROM authenticated;
-- DROP FUNCTION IF EXISTS vet_institutions_nearby(NUMERIC);
-- DROP TRIGGER IF EXISTS vet_professionals_guardia_al_insertar ON vet_professionals;
-- DROP FUNCTION IF EXISTS guardia_requiere_matricula_al_insertar();
-- -- protect_vet_privileges() queda con la cuarta guarda salvo que se restate
-- -- a mano el cuerpo de la 019 (no editar la 019 misma).
-- DROP INDEX IF EXISTS idx_vet_professionals_guardia;
-- ALTER TABLE vet_professionals DROP COLUMN IF EXISTS on_call;
-- DROP INDEX IF EXISTS idx_vet_institutions_coordenadas;
-- ALTER TABLE vet_institutions
--   DROP CONSTRAINT IF EXISTS vet_institutions_coordenadas_completas,
--   DROP CONSTRAINT IF EXISTS vet_institutions_longitude_rango,
--   DROP CONSTRAINT IF EXISTS vet_institutions_latitude_rango,
--   DROP COLUMN IF EXISTS longitude,
--   DROP COLUMN IF EXISTS latitude;
-- -- La política vet_institutions_select NO se dropea automáticamente acá:
-- -- ver la nota de asimetría arriba. Restaurar USING (true) es una decisión
-- -- explícita, no parte de este rollback.
