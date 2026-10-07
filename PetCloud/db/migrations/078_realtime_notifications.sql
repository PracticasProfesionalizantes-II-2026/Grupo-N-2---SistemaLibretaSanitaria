-- ============================================================================
-- PetCloud — Migración 078: `notifications` en la publicación de Realtime
--
-- POR QUÉ
--
-- La campana del topbar solo se enteraba de una notificación nueva al recargar
-- o cuando alguna acción revalidaba el layout. Agregar la tabla a
-- `supabase_realtime` deja que el navegador reciba los INSERT y UPDATE por
-- `postgres_changes` y actualice el badge en vivo.
--
-- SEGURIDAD
--
-- Realtime respeta RLS: cada evento se evalúa contra la política SELECT de la
-- 002 (`user_id = auth.uid()`) con el token de quien escucha. El filtro
-- `user_id=eq.<id>` del cliente es solo para no recibir ruido; quien decide qué
-- llega es la política, no el filtro. No se tocan políticas ni columnas.
--
-- Idempotente: si la tabla ya es miembro, no hace nada (ADD TABLE fallaría).
--
-- ROLLBACK
--   -- ALTER PUBLICATION supabase_realtime DROP TABLE notifications;
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
