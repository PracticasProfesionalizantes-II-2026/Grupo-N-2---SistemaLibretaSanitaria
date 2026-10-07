-- ============================================================================
-- PetCloud — Migración 028: métricas del panel municipal
--
-- Igual que en la 022: ninguna política de RLS le da al rol `municipality` un
-- SELECT sobre `pets`, `profiles` ni `vaccinations`, y sobre `profiles` está
-- prohibido por diseño agregarla (los datos personales salen únicamente por
-- las funciones `SECURITY DEFINER` ya escritas). Las cinco funciones de acá
-- no exponen ninguna fila individual ni ningún dato de dueño — solo cuentas y
-- porcentajes agregados por jurisdicción — así que, a diferencia de la ficha
-- completa del padrón, nacen habilitadas: no hay nada que auditar en un
-- promedio.
--
-- Las cinco filtran siempre por `profiles.municipality_id =
-- my_municipality_id()`, nunca reciben una jurisdicción como parámetro, y
-- rechazan con ERROR (nunca con una lista vacía) a una cuenta sin validar —
-- mismo criterio que 017/022/027.
--
-- El estado antirrábico reutiliza exactamente el CASE de
-- `municipality_census_page` (022): 'sin-datos' | 'vencida' | 'por-vencer' |
-- 'al-dia', mismo umbral de 30 días y mismo fallback de un año sin
-- `next_dose_at`. No se calcula distinto acá.
--
-- `municipality_coverage_by_neighborhood` y `municipality_heatmap_cells` usan
-- INNER JOIN contra `municipality_neighborhoods` a propósito: hoy
-- `profiles.neighborhood_id` es NULL en todas las filas (021 no tuvo
-- backfill posible), así que un INNER JOIN las descarta solo y ambas
-- funciones devuelven cero filas — el estado vacío del día uno sale de la
-- misma lógica de siempre, no de un caso especial.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- municipality_panel_metrics — los cuatro números de arriba del panel
--
-- `campanasActivas` no vive acá: sale directo de `campaigns` vía
-- `campaigns_select_staff` (024), que ya cubre a cualquier rol municipal.
-- `dosisDelMes` cuenta lo mismo que `rabies_status` mira: dosis de rabia
-- verificadas, nunca cualquier dosis — mismo recorte de alcance que el resto
-- del padrón.
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
    JOIN profiles o ON o.id = p.owner_id
    LEFT JOIN LATERAL (
      SELECT v.applied_at, v.next_dose_at
      FROM vaccinations v
      WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      ORDER BY v.applied_at DESC
      LIMIT 1
    ) rv ON true
    WHERE o.municipality_id = my_municipality_id()
  ),
  dosis_mes AS (
    SELECT COUNT(*) AS n
    FROM vaccinations v
    JOIN pets p ON p.id = v.pet_id
    JOIN profiles o ON o.id = p.owner_id
    WHERE o.municipality_id = my_municipality_id()
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

COMMENT ON FUNCTION municipality_panel_metrics IS
  'Métricas agregadas del panel: conteos y un porcentaje, ningún dato de '
  'dueño ni de mascota individual. No se audita.';

-- ----------------------------------------------------------------------------
-- municipality_coverage_by_neighborhood — cobertura agrupada por barrio
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
    JOIN profiles o ON o.id = p.owner_id
    LEFT JOIN LATERAL (
      SELECT v.applied_at, v.next_dose_at
      FROM vaccinations v
      WHERE v.pet_id = p.id AND v.verified AND unaccent(v.vaccine_name) ILIKE '%rabi%'
      ORDER BY v.applied_at DESC
      LIMIT 1
    ) rv ON true
    WHERE o.municipality_id = my_municipality_id()
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

COMMENT ON FUNCTION municipality_coverage_by_neighborhood IS
  'Cobertura agrupada por barrio. INNER JOIN a municipality_neighborhoods: '
  'sin backfill de neighborhood_id (021), hoy devuelve siempre cero filas.';

-- ----------------------------------------------------------------------------
-- municipality_monthly_registrations — altas de los últimos 12 meses
--
-- `generate_series` asegura los 12 meses en el resultado aunque alguno tenga
-- cero altas — si no, un mes sin registros faltaría en vez de aparecer en
-- cero, y el gráfico tendría un hueco en la escala de tiempo. `acumulado` es
-- el total histórico hasta ese mes, no el total dentro de la ventana de 12
-- meses — por eso es una subconsulta aparte, no una suma corrida sobre
-- `altas`.
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
    JOIN profiles o ON o.id = p.owner_id
    WHERE o.municipality_id = my_municipality_id()
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

COMMENT ON FUNCTION municipality_monthly_registrations IS
  'Altas por mes, últimos 12 meses, con los meses en cero incluidos. '
  'acumulado es el total histórico a esa fecha, no el total de la ventana. La '
  'jurisdicción se filtra en el CTE mis_mascotas, antes del LEFT JOIN por '
  'fecha — filtrarla en un segundo LEFT JOIN aparte (como en la versión '
  'original de esta función) no excluye nada si esa columna no vuelve a '
  'usarse en el SELECT.';

-- ----------------------------------------------------------------------------
-- municipality_species_distribution — cuántas mascotas por especie
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
  JOIN profiles o ON o.id = p.owner_id
  WHERE o.municipality_id = my_municipality_id()
  GROUP BY p.species
  ORDER BY cantidad DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION municipality_species_distribution IS
  'Cantidad de mascotas por especie, jurisdicción del que llama.';

-- ----------------------------------------------------------------------------
-- municipality_heatmap_cells — grilla barrio × mes, para la pantalla de
-- Estadísticas (T16). Se escribe acá porque data/stats.ts se escribe entero
-- en T15 (§5.2); el cableado a pantalla de esta función es tarea de T16.
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
  )
  SELECT
    n.id AS neighborhood_id,
    n.name AS neighborhood_name,
    meses.mes,
    COUNT(p.id) FILTER (
      WHERE date_trunc('month', p.created_at) = meses.mes
    )::int AS cantidad
  FROM municipality_neighborhoods n
  CROSS JOIN meses
  LEFT JOIN profiles o ON o.neighborhood_id = n.id AND o.municipality_id = my_municipality_id()
  LEFT JOIN pets p ON p.owner_id = o.id
  WHERE n.municipality_id = my_municipality_id()
  GROUP BY n.id, n.name, meses.mes
  ORDER BY n.name ASC, meses.mes ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION municipality_heatmap_cells IS
  'Grilla barrio x mes de altas, últimos 12 meses. Sin backfill de '
  'neighborhood_id (021), hoy devuelve cero filas (INNER-equivalente vía '
  'WHERE n.municipality_id, la fila del barrio existe pero cantidad da 0).';

-- ============================================================================
-- PERMISOS
--
-- Ninguna de las cinco expone una fila individual ni un dato de dueño: se
-- habilitan en esta misma migración para `authenticated`, igual que
-- `municipality_census_page` en la 022. La puerta real sigue siendo
-- `is_validated_municipality()`.
-- ============================================================================
GRANT EXECUTE ON FUNCTION municipality_panel_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION municipality_coverage_by_neighborhood() TO authenticated;
GRANT EXECUTE ON FUNCTION municipality_monthly_registrations() TO authenticated;
GRANT EXECUTE ON FUNCTION municipality_species_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION municipality_heatmap_cells() TO authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS municipality_heatmap_cells();
-- DROP FUNCTION IF EXISTS municipality_species_distribution();
-- DROP FUNCTION IF EXISTS municipality_monthly_registrations();
-- DROP FUNCTION IF EXISTS municipality_coverage_by_neighborhood();
-- DROP FUNCTION IF EXISTS municipality_panel_metrics();
--
-- Adición pura. Sin estas funciones el municipio vuelve a no tener ningún
-- camino a métricas agregadas, que es el estado por defecto del esquema.
