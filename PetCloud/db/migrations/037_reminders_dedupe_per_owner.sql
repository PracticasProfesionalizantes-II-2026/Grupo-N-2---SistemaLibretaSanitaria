-- ============================================================================
-- PetCloud — Migración 037: deduplicar recordatorios automáticos por dueño,
-- no solo por mascota
--
-- Con dueños N:N (034/035), `dispatch-reminders` va a insertar una fila de
-- `reminders` por cada codueño con permission='owner' en `pet_shared_access`,
-- no solo para `pets.owner_id`. El índice de deduplicación de la 014 —
-- `(pet_id, source, source_id, día)`— no incluye `owner_id`: si dos codueños
-- reciben el mismo aviso el mismo día, el segundo insert choca contra el
-- primero y el segundo dueño se queda sin su propio recordatorio (y sin
-- verlo en su `/recordatorios`, porque `reminders_select` es estrictamente
-- `owner_id = auth.uid()` — a diferencia de vacunas o medicación, esta tabla
-- nunca usó `has_pet_access`).
--
-- Se agrega `owner_id` al índice: sigue impidiendo el mismo aviso repetido
-- para el mismo dueño el mismo día (la razón de ser de la 014, sin cambios),
-- y ahora también permite que cada codueño tenga su propia fila. Los
-- recordatorios manuales (`source = 'manual'`) quedan afuera del índice
-- igual que antes — la cláusula WHERE no cambia — porque son personales de
-- quien los crea, no un aviso que se reparte.
-- ============================================================================

DROP INDEX IF EXISTS idx_reminders_dedupe;
CREATE UNIQUE INDEX idx_reminders_dedupe
  ON reminders (
    pet_id,
    owner_id,
    source,
    source_id,
    ((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
  )
  NULLS NOT DISTINCT
  WHERE source != 'manual';

-- ROLLBACK
-- DROP INDEX IF EXISTS idx_reminders_dedupe;
-- CREATE UNIQUE INDEX idx_reminders_dedupe
--   ON reminders (
--     pet_id,
--     source,
--     source_id,
--     ((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
--   )
--   NULLS NOT DISTINCT
--   WHERE source != 'manual';
