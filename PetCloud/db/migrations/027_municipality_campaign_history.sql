-- ============================================================================
-- PetCloud — Migración 027: historial de campañas de una mascota
--
-- Corrección de alcance, 2026-09-02 (`tasks.md`, T14). La ficha del padrón
-- necesita mostrar en qué campañas participó una mascota. El único vínculo
-- real entre una mascota y las campañas municipales es `vaccinations.
-- campaign_id` (026) — pero ninguna política de RLS le da al rol
-- `municipality` un SELECT sobre `vaccinations`: solo existen las del dueño
-- (002) y las de la veterinaria (008). Sin esta migración, un municipio
-- validado no tiene ningún camino a esa columna.
--
-- Un SELECT liso sobre `vaccinations` sería además una puerta demasiado
-- ancha: la tabla trae columnas clínicas (`vaccine_name`, `applied_by_id`,
-- `verified`) que todo el diseño del padrón (022/023) decidió mantener fuera
-- del alcance municipal. La función de acá adentro filtra columnas en el
-- SELECT, no en la política: nunca expone esas tres, solo el id y el nombre
-- de la campaña, y la fecha de aplicación de la dosis.
--
-- Jurisdicción, no solo validación. `is_validated_municipality()` corta a
-- quien no esté validado, igual que las funciones de la 022, pero acá hace
-- falta una segunda barrera: el id de una mascota no es, por sí solo, un
-- dato personal, pero confirmar que existe y que participó de una campaña
-- fuera de la propia jurisdicción sigue siendo una filtración real, aunque
-- chica. Se cierra en el WHERE —uniendo hasta `profiles.municipality_id`— y
-- no por convención de quien llama: una mascota ajena da cero filas, nunca
-- un error, mismo criterio que `municipality_census_record` (023).
--
-- Sin la doble puerta de la 022/023 (EXECUTE revocado hasta que exista una
-- migración de auditoría aparte): esta función no expone ningún dato
-- personal del dueño, solo participación en un operativo público. El
-- `GRANT EXECUTE` va derecho a `authenticated` en esta misma migración.
-- ============================================================================

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

  -- Jurisdicción en el WHERE, no en una excepción: una mascota de otro
  -- municipio da cero filas, igual que si nunca hubiese participado de
  -- ninguna campaña — el JOIN a `campaigns` ya descarta cualquier dosis con
  -- `campaign_id` nulo, sin necesitar un filtro aparte.
  RETURN QUERY
  SELECT
    c.id AS campaign_id,
    c.name AS campaign_name,
    -- `vaccinations.applied_at` es DATE (002); la firma de acá arriba pide
    -- TIMESTAMPTZ. Mismo motivo que el cast `u.email::TEXT` de la 023: sin
    -- el cast explícito, el RETURN QUERY rompe contra el tipo declarado.
    v.applied_at::TIMESTAMPTZ AS applied_at
  FROM vaccinations v
  JOIN pets p ON p.id = v.pet_id
  JOIN profiles o ON o.id = p.owner_id
  JOIN campaigns c ON c.id = v.campaign_id
  WHERE v.pet_id = p_pet_id
    AND o.municipality_id = my_municipality_id()
  ORDER BY v.applied_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION municipality_campaign_history_for_pet IS
  'Campañas en las que participó una mascota: solo id, nombre y fecha de '
  'aplicación de la dosis — nunca la vacuna, el veterinario que la aplicó ni '
  '"verified". Jurisdicción exigida en el WHERE (profiles.municipality_id = '
  'my_municipality_id()), no en una excepción: una mascota fuera del '
  'municipio da cero filas, igual que una sin ninguna campaña.';

-- PERMISOS: a diferencia de `municipality_census_record`/`_export` (022,
-- EXECUTE revocado hasta la 023), esta función no expone datos del dueño —
-- el GRANT va directo, sin doble puerta ni migración de desbloqueo aparte.
GRANT EXECUTE ON FUNCTION municipality_campaign_history_for_pet(UUID) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION municipality_campaign_history_for_pet(UUID) FROM authenticated;
-- DROP FUNCTION IF EXISTS municipality_campaign_history_for_pet(UUID);
--
-- Adición pura, sin tabla nueva ni columna tocada: revertir devuelve al
-- municipio al estado anterior, sin ningún camino a `vaccinations.
-- campaign_id` — el mismo vacío que esta migración existe para cerrar.
