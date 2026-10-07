-- ============================================================================
-- PetCloud — Migración 030: dosis aplicadas por campaña
--
-- La 024 (comentario propio, nota 1) ya dejó dicho que "aplicadas" no es una
-- columna: sale de contar `vaccinations.campaign_id`. `campaigns` ya es
-- legible directo por `campaigns_select_staff` (024) — esta migración no
-- toca eso. Lo que falta es el conteo, y ese sí necesita blindaje: `vaccinations`
-- sigue detrás del mismo criterio de siempre (022 en adelante), ninguna
-- política le da a municipio SELECT ahí.
--
-- Una sola función, sin parámetro, devuelve el conteo de las campañas de TODA
-- la jurisdicción en una sola llamada — no una por campaña. Es el mismo motivo
-- que ya forzó `listActiveCampaignVaccines()` en vez de una consulta por dosis
-- (design §5.1 fila 5): la lista de campañas pinta N filas, y N llamadas por
-- pintura es el antipatrón que el resto de esta fase ya evitó.
--
-- Solo dosis verificadas cuentan (mismo criterio que el estado antirrábico del
-- padrón, 022). "Inscriptos" del mock no tiene ningún respaldo real en ningún
-- lado del esquema — no hay mecanismo de inscripción en toda la base — así que
-- no se migra: se cae de la pantalla real, no se inventa una columna para él.
-- ============================================================================

CREATE OR REPLACE FUNCTION municipality_campaign_progress()
RETURNS TABLE (
  campaign_id UUID,
  applied_doses INT
) AS $$
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT c.id, COUNT(v.id) FILTER (WHERE v.verified)::int AS applied_doses
  FROM campaigns c
  LEFT JOIN vaccinations v ON v.campaign_id = c.id
  WHERE c.municipality_id = my_municipality_id()
  GROUP BY c.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION municipality_campaign_progress IS
  'Dosis aplicadas por campaña, toda la jurisdicción en una sola llamada. '
  'Solo un conteo agregado — ninguna fila de vaccinations sale de acá, no '
  'se audita, mismo criterio que las funciones de la 028.';

GRANT EXECUTE ON FUNCTION municipality_campaign_progress() TO authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS municipality_campaign_progress();
--
-- Adición pura. Sin esta función el municipio vuelve a no tener ningún camino
-- a cuántas dosis se aplicaron por campaña.
