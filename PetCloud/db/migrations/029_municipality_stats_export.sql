-- ============================================================================
-- PetCloud — Migración 029: la exportación de Estadísticas queda auditada
--
-- La 023 dejó `'stats_export'` en el CHECK de `municipality_census_access_log`
-- desde el principio, con el comentario explícito de que la función que la
-- usara vendría después ("fase posterior"). Esta es esa función.
--
-- `municipality_census_access_log` no tiene ninguna política de INSERT para
-- ningún rol autenticado — mismo motivo que la 023: el único que le escribe es
-- el cuerpo `SECURITY DEFINER` de acá abajo, corriendo como el dueño de la
-- tabla, sin necesitar ninguna política de escritura nueva.
--
-- A diferencia de `census_export` (022/023), esta función no lee ninguna fila
-- de `pets`/`profiles` directamente: reusa las funciones ya escritas y
-- auditadas por su propio motivo (028) — `municipality_coverage_by_neighborhood`,
-- `municipality_monthly_registrations`, `municipality_species_distribution`,
-- `municipality_panel_metrics` — llamándolas desde adentro. Correr una función
-- `SECURITY DEFINER` desde otra `SECURITY DEFINER` no cambia `auth.uid()`
-- (sigue siendo la sesión real), así que `my_municipality_id()` resuelve igual
-- en las cuatro; el gate de validación de cada una es defensa en profundidad
-- redundante con el de acá, no una grieta.
--
-- `record_count`: la suma de filas entre las tres partes tabulares del export
-- (barrios + meses + especies) — `panel_metrics` es una sola fila de resumen,
-- no cuenta acá por la misma razón que un total no es una lista.
-- ============================================================================

CREATE OR REPLACE FUNCTION municipality_stats_export()
RETURNS JSONB AS $$
DECLARE
  v_payload JSONB;
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
      'La exportación de estadísticas está cerrada: falta la migración 023 (registro de auditoría).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'metrics', (SELECT to_jsonb(m) FROM municipality_panel_metrics() m),
    'coverage', COALESCE(
      (SELECT jsonb_agg(c) FROM municipality_coverage_by_neighborhood() c), '[]'::jsonb
    ),
    'monthly', COALESCE(
      (SELECT jsonb_agg(r) FROM municipality_monthly_registrations() r), '[]'::jsonb
    ),
    'species', COALESCE(
      (SELECT jsonb_agg(s) FROM municipality_species_distribution() s), '[]'::jsonb
    )
  ) INTO v_payload;

  v_count :=
    jsonb_array_length(v_payload->'coverage')
    + jsonb_array_length(v_payload->'monthly')
    + jsonb_array_length(v_payload->'species');

  SELECT actor.first_name || ' ' || actor.last_name || ' <' || actor_user.email || '>'
  INTO v_actor_label
  FROM profiles actor
  JOIN auth.users actor_user ON actor_user.id = actor.id
  WHERE actor.id = auth.uid();

  INSERT INTO municipality_census_access_log (
    municipality_id, actor_profile_id, actor_label, actor_role,
    action, record_count
  ) VALUES (
    my_municipality_id(), auth.uid(), v_actor_label, my_municipality_role(),
    'stats_export', v_count
  );

  RETURN v_payload;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public;

COMMENT ON FUNCTION municipality_stats_export IS
  'Snapshot de estadísticas para exportar (métricas, cobertura, altas mensuales, '
  'especies), reusando las funciones de lectura de la 028. Siempre escribe '
  '"stats_export" en municipality_census_access_log, misma transacción.';

GRANT EXECUTE ON FUNCTION municipality_stats_export() TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION municipality_stats_export() FROM authenticated;
-- DROP FUNCTION IF EXISTS municipality_stats_export();
--
-- Adición pura. `'stats_export'` sigue siendo un valor legal en el CHECK de la
-- 023 aunque se revierta esta función — el CHECK no se toca.
