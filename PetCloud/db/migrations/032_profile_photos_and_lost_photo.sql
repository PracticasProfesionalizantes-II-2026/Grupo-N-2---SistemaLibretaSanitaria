-- ============================================================================
-- PetCloud — Migración 032: foto de perfil del dueño + foto del reporte de
-- mascota perdida
--
-- Dos piezas independientes, agrupadas en una migración porque las dos son
-- infraestructura para el mismo trabajo (subida real de imágenes, change
-- `media-uploads`):
--
-- 1) Bucket `profile-photos`, mismo criterio que `pet-photos` (003): público
--    (una foto de perfil no es un documento sensible, y `pet-photos` ya sentó
--    el precedente de bucket público para este tipo de imagen), ruta
--    `{profile_id}/{archivo}`, solo el propio dueño de la fila sube/reemplaza/
--    borra la suya.
--
-- 2) `pets.lost_photo_url` — columna nueva, independiente de `photo_url` a
--    propósito: la foto del reporte de pérdida ("así estaba cuando se
--    perdió") no tiene por qué ser la misma que la foto de perfil de siempre,
--    y cambiar una no debe tocar la otra en ningún sentido. Nullable, sin
--    default — si no se sube, el dato de perfil (`photo_url`) sirve de
--    respaldo en la capa de aplicación, no acá.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- El id del perfil, sacado de la ruta
--
-- Mismo criterio que `storage_pet_id` (003) y `storage_professional_id`
-- (010): devuelve NULL en vez de fallar si la ruta no arranca con un UUID.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION storage_profile_id(object_name TEXT)
RETURNS UUID AS $$
  SELECT CASE
    WHEN (storage.foldername(object_name))[1]
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN ((storage.foldername(object_name))[1])::uuid
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public, storage;

-- ============================================================================
-- profile-photos
--
-- Público, como `pet-photos`: la lectura de la ficha pública va directo por
-- CDN, sin pasar por RLS. Pero sí hace falta una política de SELECT acá
-- (a diferencia de lo que se asumió primero para `pet-photos`, corregido en
-- la 033): `.remove()` del SDK de Storage pasa por la API autenticada, que
-- necesita poder ver la fila en `storage.objects` para saber qué borrar. Sin
-- esto, reemplazar o quitar la foto de perfil fallaría en silencio.
-- ============================================================================
CREATE POLICY "profile_photos_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND storage_profile_id(name) = auth.uid()
  );

CREATE POLICY "profile_photos_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND storage_profile_id(name) = auth.uid()
  );

CREATE POLICY "profile_photos_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND storage_profile_id(name) = auth.uid()
  );

CREATE POLICY "profile_photos_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND storage_profile_id(name) = auth.uid()
  );

-- ============================================================================
-- pets.lost_photo_url
-- ============================================================================
ALTER TABLE pets ADD COLUMN lost_photo_url TEXT;

COMMENT ON COLUMN pets.lost_photo_url IS
  'Foto específica del reporte de mascota perdida, independiente de photo_url. '
  'NULL cuando el dueño no subió una propia — la ficha pública usa photo_url '
  'como respaldo en ese caso, esta migración no lo resuelve por SQL.';

-- ROLLBACK
-- ALTER TABLE pets DROP COLUMN IF EXISTS lost_photo_url;
-- DROP POLICY IF EXISTS "profile_photos_delete" ON storage.objects;
-- DROP POLICY IF EXISTS "profile_photos_update" ON storage.objects;
-- DROP POLICY IF EXISTS "profile_photos_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "profile_photos_select" ON storage.objects;
-- DROP FUNCTION IF EXISTS storage_profile_id(TEXT);
-- DELETE FROM storage.buckets WHERE id = 'profile-photos';
--
-- Adición pura. El DELETE del bucket no borra los archivos que ya se hayan
-- subido — eso es un paso aparte, deliberado, no algo para hacer sin mirar.
