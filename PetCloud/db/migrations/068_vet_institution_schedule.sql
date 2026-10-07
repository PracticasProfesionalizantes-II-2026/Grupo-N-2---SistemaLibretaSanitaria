-- ============================================================================
-- PetCloud — Migración 068: forma de los horarios de atención de la institución
--
-- `vet_institutions.schedule` existe desde la 001 (`JSONB NOT NULL DEFAULT
-- '{}'`) y hasta acá nadie la escribía: el editor de horarios del onboarding
-- era de mentira. Ahora la escribe `updateSchedule()` con la sesión del
-- titular, y una columna JSONB sin forma es una invitación a que el día de
-- mañana haya tres formatos distintos conviviendo en la misma tabla.
--
-- LA FORMA
--
--   '{}'                                  → todavía no cargó horarios.
--   { "monday": {...}, …, "sunday": {...} } → los siete días, siempre todos.
--
-- Cada día es `{ "open": true, "from": "HH:MM", "to": "HH:MM" }` o
-- `{ "open": false }`, sin claves de más. Un objeto con algunos días y otros no
-- se rechaza: el día que falta no se sabe si está cerrado o si no se cargó, y
-- esa ambigüedad la termina resolviendo cada pantalla a su manera.
--
-- `from < to` se compara como texto: con el formato fijo de dos dígitos, el
-- orden lexicográfico es el mismo que el horario. Consecuencia aceptada: no
-- se pueden cargar franjas que crucen la medianoche (una guardia 20:00–02:00).
-- Para eso está la guardia (`on_call`), no el horario de atención.
--
-- QUIÉN LA ESCRIBE
--
-- Solo el titular, por la política `Vet owners can update own institution`
-- (005). Es deliberado y no se amplía: el horario es un dato de la
-- institución, no de cada profesional.
--
-- PRE-FLIGHT EN PRODUCCIÓN — correr ANTES de aplicar; tiene que dar 0:
--
--   SELECT count(*)
--   FROM vet_institutions
--   WHERE NOT (
--     jsonb_typeof(schedule) = 'object'
--     AND (
--       schedule = '{}'::jsonb
--       OR (
--         (SELECT count(*) FROM jsonb_object_keys(schedule)) = 7
--         AND schedule ?& ARRAY['monday','tuesday','wednesday','thursday',
--                               'friday','saturday','sunday']
--       )
--     )
--   );
--
-- (Aproxima la validación completa: si da 0, o todas las filas son '{}' —lo
-- esperable, porque nada escribía la columna— o hay que mirarlas a mano.
-- Después de crear la función de abajo, la versión exacta es
-- `SELECT count(*) FROM vet_institutions WHERE NOT is_valid_institution_schedule(schedule);`.)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_valid_institution_schedule(p_schedule JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dias CONSTANT TEXT[] := ARRAY[
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];
  v_dia TEXT;
  v_valor JSONB;
BEGIN
  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) <> 'object' THEN
    RETURN false;
  END IF;

  IF p_schedule = '{}'::jsonb THEN
    RETURN true;
  END IF;

  -- Los siete, ni uno más ni uno menos.
  IF (SELECT count(*) FROM jsonb_object_keys(p_schedule)) <> 7
     OR NOT (p_schedule ?& v_dias)
  THEN
    RETURN false;
  END IF;

  FOREACH v_dia IN ARRAY v_dias LOOP
    v_valor := p_schedule -> v_dia;

    IF jsonb_typeof(v_valor) <> 'object'
       OR jsonb_typeof(v_valor -> 'open') IS DISTINCT FROM 'boolean'
    THEN
      RETURN false;
    END IF;

    IF (v_valor ->> 'open')::boolean THEN
      IF (SELECT count(*) FROM jsonb_object_keys(v_valor)) <> 3
         OR jsonb_typeof(v_valor -> 'from') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_valor -> 'to') IS DISTINCT FROM 'string'
         OR (v_valor ->> 'from') !~ '^([01]\d|2[0-3]):[0-5]\d$'
         OR (v_valor ->> 'to') !~ '^([01]\d|2[0-3]):[0-5]\d$'
         OR NOT ((v_valor ->> 'from') COLLATE "C" < (v_valor ->> 'to') COLLATE "C")
      THEN
        RETURN false;
      END IF;
    ELSIF (SELECT count(*) FROM jsonb_object_keys(v_valor)) <> 1 THEN
      -- Un día cerrado no arrastra horas viejas: `{ "open": false }` y nada más.
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION is_valid_institution_schedule(JSONB) IS
  'Forma válida de vet_institutions.schedule: ''{}'' o los siete días (068).';

ALTER TABLE vet_institutions
  ADD CONSTRAINT vet_institutions_schedule_shape
  CHECK (is_valid_institution_schedule(schedule));
