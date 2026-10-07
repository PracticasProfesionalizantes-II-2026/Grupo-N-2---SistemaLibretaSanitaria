-- ============================================================================
-- PetCloud — Migración 021: `profiles.municipality_id` pasa a ser una FK real
--
-- La 006 dejó la columna en `TEXT` a propósito, con el comentario explícito de
-- que se volvería FK "cuando esa tabla exista". La 017 creó `municipalities`
-- con un `slug` que existe por una sola razón: llevar los valores de texto que
-- hoy tiene esta columna ("vte-lopez", "san-isidro", "rafaela", "sunchales")
-- hasta la fila nueva, de forma determinista.
--
-- `updateMunicipality()` (`src/features/owner/actions/pets-actions.ts`) es el
-- único lugar que escribe esta columna hoy, y solo puede escribir uno de esos
-- cuatro slugs — son los únicos que ofrece `municipality-picker.tsx`. Aun así,
-- esta migración no asume eso: cualquier valor que no matchee ningún
-- `municipalities.slug` queda en NULL, nunca se adivina. El motivo es
-- concreto: el modo de falla de adivinar es meter el nombre, la dirección y el
-- teléfono de una persona real en el padrón del municipio equivocado.
--
-- ----------------------------------------------------------------------------
-- Pre-flight — correr esto en producción ANTES de aprobar esta migración
-- ----------------------------------------------------------------------------
--
-- 1) Distribución de valores actuales, para saber cuántas filas hay por slug
--    (y detectar a ojo cualquier valor que no sea uno de los cuatro sembrados):
--
--      SELECT municipality_id, count(*) FROM profiles
--      WHERE municipality_id IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;
--
-- 2) Confirmar que ninguna de las 5 cuentas semilla queda entre las filas sin
--    mapeo (si esta consulta devuelve 0 filas, ninguna cuenta semilla se ve
--    afectada; si devuelve alguna, hay que decidir a mano qué hacer con esa
--    cuenta antes de aplicar):
--
--      SELECT p.id, p.first_name, p.last_name, p.municipality_id
--      FROM profiles p
--      WHERE p.municipality_id IS NOT NULL
--        AND NOT EXISTS (
--          SELECT 1 FROM municipalities m WHERE m.slug = p.municipality_id
--        );
--
-- El `RAISE NOTICE` de más abajo repite el conteo de la consulta 1 en el
-- momento exacto de aplicar, para que el número quede visible en el log de la
-- corrida y no dependa de que alguien haya guardado el resultado del pre-flight.
-- ============================================================================

-- La columna vieja no se borra: se renombra. El rollback de esta migración es
-- volver a apuntar `municipality_id` a ella, no restaurar un backup — el valor
-- de texto original queda disponible mientras dure la transición.
ALTER TABLE profiles RENAME COLUMN municipality_id TO municipality_slug_legacy;

COMMENT ON COLUMN profiles.municipality_slug_legacy IS
  'Valor de texto anterior a la 021 ("vte-lopez", etc.). Se conserva solo para poder revertir la FK sin perder el dato; no lo lee ningún código de la aplicación.';

ALTER TABLE profiles
  ADD COLUMN municipality_id UUID REFERENCES municipalities(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.municipality_id IS
  'Jurisdicción declarada, FK a municipalities.id. Decide qué campañas, ordenanza y vacunas obligatorias ve. NULL significa que la persona no declaró ninguna todavía, o que la que tenía no mapeó a ningún municipio sembrado — nunca se adivina.';

CREATE INDEX idx_profiles_municipality ON profiles(municipality_id);

-- `profiles.neighborhood_id` no tiene backfill posible: el barrio nunca se
-- guardó en ningún lado hasta ahora. Arranca en NULL para todo el mundo, y el
-- onboarding empieza a pedirlo desde este momento en adelante (fuera de
-- alcance de esta migración — la resuelve el slice de aplicación).
ALTER TABLE profiles
  ADD COLUMN neighborhood_id UUID REFERENCES municipality_neighborhoods(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.neighborhood_id IS
  'Barrio declarado dentro del municipio. Alimenta el targeting de campañas y las estadísticas de cobertura por barrio. Sin backfill: todas las filas empiezan en NULL.';

CREATE INDEX idx_profiles_neighborhood ON profiles(neighborhood_id);

-- Backfill determinista: join por slug. Toda fila cuyo texto no matchea
-- ningún `municipalities.slug` queda con `municipality_id` en NULL — la
-- consulta no tiene rama de "más parecido" ni normaliza mayúsculas/acentos a
-- propósito, porque cualquier heurística ahí es exactamente la clase de
-- adivinanza que este archivo evita.
UPDATE profiles p
SET municipality_id = m.id
FROM municipalities m
WHERE m.slug = p.municipality_slug_legacy;

-- El número queda en el log de la corrida, no solo en el resultado del
-- pre-flight guardado a mano. Cuenta filas que tenían un valor de texto no
-- vacío y no terminaron mapeadas.
DO $$
DECLARE
  sin_mapear INTEGER;
BEGIN
  SELECT count(*) INTO sin_mapear
  FROM profiles
  WHERE municipality_slug_legacy IS NOT NULL
    AND municipality_id IS NULL;

  RAISE NOTICE
    'Migración 021: % fila(s) con municipality_slug_legacy sin mapear a ningún municipio sembrado (quedan en NULL).',
    sin_mapear;
END $$;

-- ROLLBACK
-- DROP INDEX IF EXISTS idx_profiles_neighborhood;
-- ALTER TABLE profiles DROP COLUMN neighborhood_id;
-- DROP INDEX IF EXISTS idx_profiles_municipality;
-- ALTER TABLE profiles DROP COLUMN municipality_id;
-- ALTER TABLE profiles RENAME COLUMN municipality_slug_legacy TO municipality_id;
--
-- El valor de texto original queda intacto en municipality_slug_legacy hasta
-- este punto, así que este rollback es repuntar la columna, no restaurar un
-- backup. Si esta migración ya fue seguida por otra que dependa de la FK
-- (censo, campañas), hay que revertir esas primero.
