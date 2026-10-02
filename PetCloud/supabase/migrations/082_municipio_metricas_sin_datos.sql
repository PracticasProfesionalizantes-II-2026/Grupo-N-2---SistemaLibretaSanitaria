-- ============================================================================
-- PetCloud — Migración 082: "sin datos" en las métricas del panel municipal
--
-- El panel mostraba "Antirrábica al día: 0 %" al lado de "Vacunas vencidas: 0",
-- que parece una contradicción: faltaba la tercera categoría, las mascotas sin
-- ninguna antirrábica verificada. El PR #145 la sacaba del padrón paginado,
-- con tope de 200 filas ("200 o más"). Esta migración devuelve el conteo exacto
-- desde la misma consulta que ya clasifica cada mascota, así que los tres
-- números salen del mismo censo y no pueden separarse.
--
-- Además, "hoy" pasa a ser el día argentino. `CURRENT_DATE` es la fecha del
-- servidor (UTC): entre las 21 y las 24 h de Argentina, una antirrábica que
-- vence hoy ya contaba como vencida y "dosis del mes" cambiaba de mes el último
-- día a la noche. Ver la trampa de zona horaria en
-- docs/desarrollo/trampas-conocidas.md.
--
-- Agregar una columna cambia el tipo de retorno, y CREATE OR REPLACE no puede
-- hacerlo: la función se borra y se vuelve a crear, con sus permisos. El cuerpo
-- es el de la 038 salvo la columna nueva y la fecha.
--
-- Permisos: antes EXECUTE quedaba abierto a PUBLIC y anon (la guarda
-- `is_validated_municipality()` los rechazaba adentro igual). Se cierran, como
-- el resto de las funciones SECURITY DEFINER del proyecto.
-- ============================================================================

DROP FUNCTION IF EXISTS municipality_panel_metrics();

CREATE FUNCTION municipality_panel_metrics()
RETURNS TABLE(
  registradas integer,
  cobertura numeric,
  vencidas integer,
  sin_datos integer,
  dosis_del_mes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
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
          < v_hoy THEN 'vencida'
        WHEN (COALESCE(rv.next_dose_at, rv.applied_at + INTERVAL '1 year'))::date
          <= v_hoy + INTERVAL '30 days' THEN 'por-vencer'
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
      AND date_trunc('month', v.applied_at) = date_trunc('month', v_hoy)
  )
  SELECT
    COUNT(*)::int AS registradas,
    CASE WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE censo.rabies_status = 'al-dia') / COUNT(*), 1)
    END AS cobertura,
    COUNT(*) FILTER (WHERE censo.rabies_status = 'vencida')::int AS vencidas,
    COUNT(*) FILTER (WHERE censo.rabies_status = 'sin-datos')::int AS sin_datos,
    (SELECT n FROM dosis_mes)::int AS dosis_del_mes
  FROM censo;
END;
$$;

REVOKE ALL ON FUNCTION municipality_panel_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION municipality_panel_metrics() FROM anon;
GRANT EXECUTE ON FUNCTION municipality_panel_metrics() TO authenticated;

-- ROLLBACK
-- Volver a crear la versión de la 038 (sin `sin_datos`, con CURRENT_DATE):
-- DROP FUNCTION IF EXISTS municipality_panel_metrics();
-- y reejecutar el CREATE de supabase/migrations/038_municipality_functions_multi_owner.sql.
