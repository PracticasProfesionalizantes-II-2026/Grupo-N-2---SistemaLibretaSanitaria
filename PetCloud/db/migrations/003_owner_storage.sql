-- ============================================================================
-- PetCloud — Migración 003: buckets de archivos del dueño
--
-- Va aparte de la 002 porque toca el esquema `storage`, que viene del shim de compatibilidad y no
-- nuestro: separarlo hace evidente qué se le pide a la plataforma y qué es
-- nuestro modelo de datos.
--
-- Convención de rutas, y de ella depende toda la seguridad de abajo:
--
--     {pet_id}/{nombre-del-archivo}
--
-- El primer segmento de la ruta es el id de la mascota, y es lo que permite
-- decidir quién puede tocar el archivo con la misma función que gobierna el
-- resto de la ficha. Un archivo subido fuera de esa convención no queda
-- accesible para nadie.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Buckets
--
-- Las fotos son públicas porque se muestran en la ficha del collar, que abre
-- quien encuentra a la mascota y no tiene cuenta. Los documentos —estudios,
-- recetas, certificados— no: son datos de salud y van privados.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('pet-photos', 'pet-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('pet-documents', 'pet-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- El id de la mascota, sacado de la ruta
--
-- Devuelve NULL en vez de fallar si la ruta no arranca con un UUID: un `::uuid`
-- pelado sobre una ruta con cualquier otra forma aborta la consulta entera, y un
-- error de sintaxis no es la respuesta correcta a "este archivo no es tuyo".
-- Con NULL, `has_pet_access(NULL)` da falso y la política simplemente niega.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION storage_pet_id(object_name TEXT)
RETURNS UUID AS $$
  SELECT CASE
    WHEN (storage.foldername(object_name))[1]
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN ((storage.foldername(object_name))[1])::uuid
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public, storage;

-- ============================================================================
-- POLÍTICAS
-- ============================================================================

-- ------------------------------------------------------------- pet-photos
--
-- La lectura es pública por el bucket: la sirve el CDN sin pasar por RLS. Lo que
-- se controla acá es quién puede subir, reemplazar y borrar.
CREATE POLICY "pet_photos_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pet-photos'
    AND has_pet_access(storage_pet_id(name), 'edit')
  );

CREATE POLICY "pet_photos_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'pet-photos'
    AND has_pet_access(storage_pet_id(name), 'edit')
  );

CREATE POLICY "pet_photos_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pet-photos'
    AND has_pet_access(storage_pet_id(name), 'edit')
  );

-- ---------------------------------------------------------- pet-documents
--
-- Acá sí se controla la lectura: son datos de salud. El bucket es privado, así
-- que el archivo se sirve con una URL firmada y de duración corta que emite el
-- servidor después de comprobar el acceso.
CREATE POLICY "pet_documents_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pet-documents'
    AND has_pet_access(storage_pet_id(name))
  );

CREATE POLICY "pet_documents_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pet-documents'
    AND has_pet_access(storage_pet_id(name), 'edit')
  );

CREATE POLICY "pet_documents_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pet-documents'
    AND has_pet_access(storage_pet_id(name), 'edit')
  );
