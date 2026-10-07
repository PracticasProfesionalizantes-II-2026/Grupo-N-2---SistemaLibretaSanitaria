-- ============================================================================
-- PetCloud — Migración 033: política de SELECT para pet-photos
--
-- La 003 no le puso política de SELECT a `pet-photos` a propósito: la ficha
-- pública del collar lee la foto por la URL pública del bucket, que no pasa
-- por RLS. El razonamiento estaba incompleto — `.remove()` y `.list()` del
-- SDK de Storage sí pasan por la API autenticada, y esa API necesita poder
-- **ver** la fila en `storage.objects` para saber qué borrar. Sin política de
-- SELECT, el dueño de la mascota no puede reemplazar ni borrar su propia foto
-- desde la aplicación: el `remove()` no encuentra nada que borrar y devuelve
-- éxito con una lista vacía, sin error — el mismo silencio que un UPDATE
-- bloqueado por RLS.
--
-- `pet-documents` (misma migración 003) no tiene este problema porque ya
-- tenía su propia política de SELECT, ahí sí necesaria para las URLs
-- firmadas de un bucket privado.
--
-- Esto no vuelve pública ninguna lectura nueva: la URL pública del bucket
-- sigue sirviendo el archivo sin pasar por RLS, esta política solo habilita
-- al dueño (o a quien tenga acceso compartido) a listar/gestionar sus propios
-- archivos a través del SDK.
-- ============================================================================
CREATE POLICY "pet_photos_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pet-photos'
    AND has_pet_access(storage_pet_id(name))
  );

-- ROLLBACK
-- DROP POLICY IF EXISTS "pet_photos_select" ON storage.objects;
