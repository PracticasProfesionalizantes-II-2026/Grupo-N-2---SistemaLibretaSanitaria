-- ============================================================================
-- PetCloud — Migración 071: "no estoy" y "de vacaciones"
--
-- `vet_professionals.absence_status`: si el profesional está disponible, no
-- está, o está de vacaciones. Es personal: cada uno cambia su propia fila por
-- la política `vet_professionals_update_own` (058, `auth.uid() = profile_id
-- AND removed_at IS NULL` en USING y WITH CHECK), y no afecta a los colegas.
--
-- LO QUE CAMBIA EN LA GUARDIA
--
-- Alguien ausente no puede estar de guardia. Se hace cumplir en
-- `protect_vet_privileges()`, igual que la guarda de matrícula de la 055:
--
--   * prender `on_call` estando ausente se revierte a `false` en silencio;
--   * marcarse ausente con la guardia prendida la apaga en el mismo UPDATE.
--
-- Lo segundo es decisión y no accidente: la alternativa —rechazar el cambio
-- de estado hasta que apague la guardia— obliga a dos pasos a alguien que
-- justamente se está yendo, y dejar la guardia prendida "en pausa" haría que
-- al volver apareciera de guardia sin haberlo pedido. Al volver a
-- "disponible" la guardia queda apagada y se prende a mano.
--
-- Como las otras siete, la guarda nueva va después de la exención de
-- service role / postgres / supabase_admin: el panel de PetCloud y los scripts
-- de datos pueden escribir cualquier combinación. Para el resto, vale siempre.
--
-- `absence_status` en sí NO es un privilegio: el trigger no lo revierte.
--
-- `vet_institutions_nearby()` y `get_on_call_names()` suman
-- `absence_status = 'available'` a sus filtros de guardia. Con el trigger ya
-- no debería existir una fila ausente con `on_call = true` escrita por un
-- usuario, pero la lectura no se apoya en eso: service role sí puede dejarla.
-- Los dos cuerpos salen de `pg_get_functiondef()` tal como los dejó la 070.
-- ============================================================================

ALTER TABLE vet_professionals
  ADD COLUMN absence_status TEXT NOT NULL DEFAULT 'available'
  CHECK (absence_status IN ('available', 'unavailable', 'vacation'));

COMMENT ON COLUMN vet_professionals.absence_status IS
  'Disponibilidad propia del profesional (071). Ausente ⇒ on_call = false.';

-- ----------------------------------------------------------------------------
-- 1 · `protect_vet_privileges()`, completa, con la octava guarda
--
-- Cuerpo actual (060) copiado de `pg_get_functiondef()`; lo único nuevo es el
-- bloque marcado "Octava (071)". Las siete anteriores quedan intactas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_vet_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    NEW.institution_id := OLD.institution_id;
  END IF;

  IF NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    NEW.removed_at := OLD.removed_at;
  END IF;

  -- Séptima (060): el sello de revisión lo escribe el panel, no el revisado.
  IF NEW.license_reviewed_at IS DISTINCT FROM OLD.license_reviewed_at THEN
    NEW.license_reviewed_at := OLD.license_reviewed_at;
  END IF;

  -- Octava (071): ausente no está de guardia. Cubre las dos puertas: prender
  -- la guardia estando ausente, y marcarse ausente con la guardia prendida.
  IF NEW.on_call AND NEW.absence_status <> 'available' THEN
    NEW.on_call := false;
  END IF;

  RETURN NEW;
END;
$function$;

-- La misma regla al insertar (`guardia_requiere_matricula_al_insertar()`,
-- 055): el INSERT no pasa por el trigger de arriba, que es BEFORE UPDATE.
-- Cuerpo actual copiado de `pg_get_functiondef()`, más la guarda nueva.
CREATE OR REPLACE FUNCTION public.guardia_requiere_matricula_al_insertar()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.on_call AND NOT NEW.license_validated THEN
    NEW.on_call := false;
  END IF;

  -- 071: ausente no está de guardia.
  IF NEW.on_call AND NEW.absence_status <> 'available' THEN
    NEW.on_call := false;
  END IF;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2 · Nombres de guardia: sin ausentes
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
      AND g.absence_status = 'available'
    ORDER BY pr.first_name, pr.last_name
  );
$$;

-- `CREATE OR REPLACE` conserva los permisos, pero se repiten para que esta
-- migración se lea sola.
REVOKE ALL ON FUNCTION get_on_call_names(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_on_call_names(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_on_call_names(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3 · El directorio: una clínica cuyos únicos de guardia están ausentes no
--     figura de guardia. Mismo tipo de retorno que la 070 → alcanza con
--     `CREATE OR REPLACE`, y los GRANT se conservan.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vet_institutions_nearby(p_radius_km NUMERIC DEFAULT 10)
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
  -- cero filas de siempre en vez de un `permission denied`. Ver la 070.
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
         -- figurando de guardia. `absence_status` es la 071: quien no está o
         -- está de vacaciones tampoco. `get_on_call_names()` usa los mismos
         -- filtros.
         EXISTS (SELECT 1 FROM vet_professionals g
                 WHERE g.institution_id = v.id
                   AND g.on_call AND g.license_validated
                   AND g.removed_at IS NULL
                   AND g.absence_status = 'available') AS on_call,
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
