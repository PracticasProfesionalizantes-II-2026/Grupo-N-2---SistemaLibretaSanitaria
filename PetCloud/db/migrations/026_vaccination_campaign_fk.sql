-- ============================================================================
-- PetCloud — Migración 026: `vaccinations.campaign_id` pasa a ser una FK real
--
-- La 002 dejó la columna en `UUID` sin FK, porque en ese momento no existía
-- ninguna tabla `campaigns` a la cual apuntar. La 024 la creó. Esta migración
-- cierra ese hueco: `campaign_id` deja de ser un UUID suelto y pasa a estar
-- garantizado por la base, no solo por convención de la aplicación.
--
-- La limpieza defensiva de más abajo corre igual, sin condición previa, aunque
-- hoy no debería tener nada que limpiar: `campaign_id` es UUID desde la 002, y
-- todo dato de campaña que existe hoy en el sistema viene de
-- `features/municipality/content/campaigns.ts`, cuyos ids son slugs de mock
-- ("mc1", "mc2", ...) — ningún UUID real puede haber quedado escrito en esta
-- columna todavía. Aun así, la limpieza no se salta: es un no-op seguro cuando
-- no hay huérfanos, y es lo único que protege contra una referencia a una
-- campaña borrada o inconsistente bloqueando el `ADD CONSTRAINT` de más abajo,
-- tanto hoy como en cualquier corrida futura de esta misma migración.
--
-- `ON DELETE SET NULL`, nunca CASCADE: borrar una campaña no puede borrar una
-- dosis aplicada. La dosis es un hecho clínico que ya ocurrió — perder la
-- campaña de origen es aceptable, perder el registro de que se vacunó a un
-- animal no lo es.
-- ============================================================================

-- El conteo queda en el log de esta corrida, no solo en un resultado guardado
-- a mano. Se calcula antes del UPDATE de más abajo porque, una vez aplicado,
-- las filas huérfanas ya no son distinguibles de las que siempre estuvieron en
-- NULL.
DO $$
DECLARE
  huerfanas INTEGER;
BEGIN
  SELECT count(*) INTO huerfanas
  FROM vaccinations v
  WHERE v.campaign_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = v.campaign_id);

  RAISE NOTICE
    'Migración 026: % dosis con campaign_id huérfano (sin campaña real en campaigns), pasan a NULL.',
    huerfanas;
END $$;

-- Limpieza defensiva: cualquier `campaign_id` que no matchee ninguna
-- `campaigns.id` queda en NULL antes de agregar la restricción. La dosis en sí
-- no se toca — solo se pierde el vínculo con una campaña que ya no existe o
-- que nunca existió de verdad.
UPDATE vaccinations v SET campaign_id = NULL
WHERE campaign_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = v.campaign_id);

ALTER TABLE vaccinations ADD CONSTRAINT vaccinations_campaign_fk
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

-- ROLLBACK
-- ALTER TABLE vaccinations DROP CONSTRAINT vaccinations_campaign_fk;
--
-- No hay dato que restaurar: el UPDATE de más arriba solo afecta filas cuyo
-- `campaign_id` ya era huérfano (no correspondía a ninguna campaña real), así
-- que revertir la restricción no revive ninguna referencia perdida.
