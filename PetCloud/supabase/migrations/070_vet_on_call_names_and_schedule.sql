-- ============================================================================
-- PetCloud — Migración 070: nombres de guardia que se ven, y guardia programada
--
-- 1 · `on_call_names` VOLVÍA SIEMPRE VACÍO PARA LOS DUEÑOS
--
-- `vet_institutions_nearby()` es `SECURITY INVOKER` (a propósito, 055) y arma
-- los nombres con un join contra `profiles`. Las únicas políticas de SELECT de
-- `profiles` son la fila propia (001) y `signed_a_record_for_my_pet` (015): un
-- dueño cualquiera no lee el perfil de un veterinario que nunca atendió a su
-- mascota, así que el array salía vacío aunque hubiera guardia. El badge
-- "De guardia ahora" se veía bien porque sale de `vet_professionals`, cuya
-- política de SELECT es `USING (true)`; los nombres no.
--
-- El arreglo es `get_on_call_names(p_institution_id)`, `SECURITY DEFINER`, que
-- devuelve **solo** `nombre apellido` de quienes están de guardia en esa
-- institución, con los mismos filtros que el `on_call` del directorio. Nada
-- más de `profiles` sale de ahí: ni email, ni teléfono, ni ids. Lee dos
-- tablas (`vet_professionals` y `profiles`) porque el nombre vive en la
-- segunda y quién está de guardia en la primera; no hay forma de hacerlo con
-- una sola.
--
-- Es invocable directo por cualquier `authenticated` con cualquier id de
-- institución. Es aceptado: devuelve exactamente lo que el directorio ya le
-- muestra a cualquier dueño con municipio cargado. `anon` no la ejecuta.
--
-- 2 · POR QUÉ `vet_institutions_nearby()` PASA A PL/pgSQL
--
-- Postgres comprueba el permiso EXECUTE de cada función que aparece en una
-- consulta al inicializar el plan, no al evaluar la fila. Probado en local:
-- aunque el CTE de origen de `anon` quede vacío (y aun envolviendo la llamada
-- en un `CASE`/`WHERE auth.uid() IS NOT NULL`), llamar a una función que
-- `anon` no puede ejecutar tira `permission denied` en vez de devolver cero
-- filas. Hoy `anon` recibe cero filas sin error
-- (`directorio-veterinarias.test.ts`, caso 22), y eso no puede cambiar.
--
-- En PL/pgSQL la consulta se planifica recién cuando se ejecuta la sentencia,
-- así que un `IF auth.uid() IS NULL THEN RETURN; END IF;` antes del
-- `RETURN QUERY` devuelve el mismo resultado de siempre a `anon` sin tocar
-- `get_on_call_names()`. Sigue siendo `SECURITY INVOKER`
-- (`vet_directorio_seguridad()` lo comprueba) y el cuerpo de la consulta es el
-- de la 058, leído con `pg_get_functiondef()` —no reconstruido de memoria—.
--
-- Cambia el tipo de retorno (se agrega `on_call_schedule`), así que hay que
-- `DROP` + `CREATE`: `CREATE OR REPLACE` no puede cambiar las columnas de un
-- `RETURNS TABLE`. El DROP se lleva los GRANT; se restauran abajo los mismos
-- que tenía (PUBLIC, `anon`, `authenticated`, `service_role`).
--
-- 3 · GUARDIA PROGRAMADA
--
-- `vet_institutions.on_call_schedule`: los días de la semana en que la
-- clínica hace guardia (`["saturday"]` = "hace guardia los sábados"). Es un
-- dato de la institución y lo edita el titular, como los horarios (068).
-- Independiente del interruptor de cada profesional: el directorio sigue
-- devolviendo `on_call` como la guardia en vivo, y la pantalla del dueño
-- decide "hoy" en la zona horaria de Buenos Aires para combinar las dos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Días de guardia programada
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_valid_on_call_schedule(p_days JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p_days) = 'array'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_days) AS d(valor)
       WHERE jsonb_typeof(d.valor) IS DISTINCT FROM 'string'
          OR d.valor #>> '{}' NOT IN ('monday', 'tuesday', 'wednesday',
                                      'thursday', 'friday', 'saturday', 'sunday')
     )
     AND (SELECT count(DISTINCT d.valor) FROM jsonb_array_elements(p_days) AS d(valor))
         = jsonb_array_length(p_days);
$$;

COMMENT ON FUNCTION is_valid_on_call_schedule(JSONB) IS
  'Forma válida de vet_institutions.on_call_schedule: array de días sin repetir (070).';

ALTER TABLE vet_institutions
  ADD COLUMN on_call_schedule JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE vet_institutions
  ADD CONSTRAINT vet_institutions_on_call_schedule_shape
  CHECK (is_valid_on_call_schedule(on_call_schedule));

-- ----------------------------------------------------------------------------
-- 2 · Nombres de quienes están de guardia
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_on_call_names(p_institution_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT concat_ws(' ', pr.first_name, pr.last_name)
    FROM vet_professionals g
    JOIN profiles pr ON pr.id = g.profile_id
    WHERE g.institution_id = p_institution_id
      AND g.on_call AND g.license_validated
      AND g.removed_at IS NULL
    ORDER BY pr.first_name, pr.last_name
  );
$$;

REVOKE ALL ON FUNCTION get_on_call_names(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_on_call_names(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_on_call_names(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3 · El directorio, con los nombres y los días programados
-- ----------------------------------------------------------------------------
DROP FUNCTION vet_institutions_nearby(NUMERIC);

CREATE FUNCTION vet_institutions_nearby(p_radius_km NUMERIC DEFAULT 10)
RETURNS TABLE(
  id UUID,
  name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  distance_km DOUBLE PRECISION,
  on_call BOOLEAN,
  on_call_names TEXT[],
  on_call_schedule TEXT[]
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  -- Sin sesión no hay origen (el CTE de abajo sale vacío) y, además, `anon`
  -- no puede ejecutar `get_on_call_names()`: cortar acá devuelve las mismas
  -- cero filas de siempre en vez de un `permission denied`. Ver el encabezado.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
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
         -- que se adose a esta institución se publica como el veterinario de
         -- guardia de una clínica ajena y validada. `removed_at IS NULL` es
         -- lo que agrega la 058: alguien dado de baja no puede seguir
         -- figurando de guardia. `get_on_call_names()` usa los mismos filtros.
         EXISTS (SELECT 1 FROM vet_professionals g
                 WHERE g.institution_id = v.id
                   AND g.on_call AND g.license_validated
                   AND g.removed_at IS NULL) AS on_call,
         get_on_call_names(v.id) AS on_call_names,
         ARRAY(SELECT jsonb_array_elements_text(v.on_call_schedule))
           AS on_call_schedule
  FROM vet_institutions v, caja c
  WHERE v.validated
    AND v.latitude  BETWEEN (c.lat - c.d_lat)::numeric AND (c.lat + c.d_lat)::numeric
    AND v.longitude BETWEEN (c.lng - c.d_lng)::numeric AND (c.lng + c.d_lng)::numeric
  ORDER BY distance_km;
END;
$$;

GRANT EXECUTE ON FUNCTION vet_institutions_nearby(NUMERIC)
  TO PUBLIC, anon, authenticated, service_role;
