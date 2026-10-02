-- ============================================================================
-- PetCloud — Migración 079: índices únicos parciales en `notifications`
--
-- POR QUÉ
--
-- Dos notificaciones deben llegar una sola vez por usuario y hoy la garantía
-- es solo de la aplicación (check-then-act), así que dos llamadas en carrera
-- pueden duplicarlas:
--   - campañas municipales: una por (usuario, link de la campaña).
--   - bienvenida de dueño: una por usuario (type 'system', link '/inicio').
-- El índice lo garantiza en la base. El código trata el error 23505
-- (unique_violation) como "ya enviada" y sigue.
--
-- POR QUÉ PARCIALES
--
-- Un índice único sobre (user_id, type, link) general rompería tipos que
-- legítimamente repiten el mismo usuario/tipo/link: avistamientos de
-- lost_pet, recordatorios, visitas, pet_access y licencia veterinaria. Por eso
-- cada índice cubre solo su tipo de notificación.
--
-- DATOS EXISTENTES
--
-- Antes de crear los índices se borran los duplicados ya existentes,
-- conservando el más antiguo de cada grupo (created_at, id). Sin esto el
-- CREATE UNIQUE INDEX fallaría en producción.
--
-- Idempotente: el DELETE no hace nada sin duplicados y los índices usan
-- IF NOT EXISTS.
--
-- ROLLBACK (los duplicados borrados no se recuperan)
--   -- DROP INDEX IF EXISTS public.notifications_campaign_once;
--   -- DROP INDEX IF EXISTS public.notifications_owner_welcome_once;
-- ============================================================================

-- Campañas: una por (user_id, link).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, link
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.notifications
  WHERE type = 'campaign'
    AND link IS NOT NULL
)
DELETE FROM public.notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

-- Bienvenida de dueño: una por user_id.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.notifications
  WHERE type = 'system'
    AND link = '/inicio'
)
DELETE FROM public.notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_campaign_once
  ON public.notifications (user_id, link)
  WHERE type = 'campaign';

CREATE UNIQUE INDEX IF NOT EXISTS notifications_owner_welcome_once
  ON public.notifications (user_id)
  WHERE type = 'system' AND link = '/inicio';
