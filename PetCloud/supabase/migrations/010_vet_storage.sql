-- ============================================================================
-- PetCloud — Migración 010: archivos del veterinario
--
-- Dos buckets, los dos privados:
--
--   vet-signatures   la imagen de la firma del profesional
--   medical-studies  radiografías, análisis y demás estudios de una atención
--
-- Misma convención de rutas que la 003, y de ella depende toda la seguridad:
-- el primer segmento es el id que decide quién puede tocar el archivo.
--
--   vet-signatures/{vet_professional_id}/{archivo}
--   medical-studies/{pet_id}/{archivo}
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('vet-signatures', 'vet-signatures', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-studies', 'medical-studies', false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- El id del profesional, sacado de la ruta
--
-- Mismo criterio que `storage_pet_id` de la 003: devuelve NULL en vez de fallar
-- si la ruta no arranca con un UUID. Un `::uuid` pelado aborta la consulta
-- entera, y un error de sintaxis no es la respuesta correcta a "este archivo no
-- es tuyo" — con NULL la política simplemente niega.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION storage_professional_id(object_name TEXT)
RETURNS UUID AS $$
  SELECT CASE
    WHEN (storage.foldername(object_name))[1]
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN ((storage.foldername(object_name))[1])::uuid
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public, storage;

-- ----------------------------------------------------------------------------
-- ¿Este profesional firmó algo de una mascota mía?
--
-- Es lo que habilita al dueño a ver la firma en su libreta. La respuesta la da
-- la historia clínica, no una lista de permisos: si hay un registro firmado por
-- esa persona sobre una mascota a la que el solicitante tiene acceso, la firma
-- forma parte de ese documento y tiene que poder verse.
--
-- `SECURITY DEFINER` y una sola tabla, como el resto: una política de RLS nunca
-- consulta directo otra tabla con RLS (regla de la migración 005).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION signed_for_my_pet(p_professional_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM medical_records
    WHERE vet_professional_id = p_professional_id
      AND is_signed = true
      AND has_pet_access(pet_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- La consulta de arriba filtra por profesional y hoy no hay índice por esa
-- columna: se agrega acá, y de paso sirve para listar lo que firmó cada uno.
CREATE INDEX IF NOT EXISTS idx_medical_records_vet_professional
  ON medical_records(vet_professional_id);

-- ============================================================================
-- vet-signatures
--
-- La lee su dueño, y también quien tenga en su libreta un registro que esa
-- persona firmó. La firma es parte del documento: sacarla del PDF dejaría un
-- certificado con el nombre de un profesional y ningún rastro suyo.
--
-- Lo que **no** pasa es que cualquier veterinario vea las firmas de los demás,
-- ni que un dueño vea la de un profesional que nunca atendió a su mascota. El
-- acceso lo da haber firmado algo suyo, y se corta solo cuando esa relación no
-- existe.
--
-- Escribir sigue siendo de cada quien: la firma se sube una vez y nadie más la
-- toca.
-- ============================================================================
CREATE POLICY "vet_signatures_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'vet-signatures'
    AND (
      storage_professional_id(name) = my_vet_professional_id()
      OR signed_for_my_pet(storage_professional_id(name))
    )
  );

CREATE POLICY "vet_signatures_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vet-signatures'
    AND storage_professional_id(name) = my_vet_professional_id()
  );

CREATE POLICY "vet_signatures_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vet-signatures'
    AND storage_professional_id(name) = my_vet_professional_id()
  );

CREATE POLICY "vet_signatures_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vet-signatures'
    AND storage_professional_id(name) = my_vet_professional_id()
  );

-- ============================================================================
-- medical-studies
--
-- Un estudio es de la mascota, no de la veterinaria que lo sacó: el dueño tiene
-- que poder verlo aunque cambie de veterinaria, y el próximo profesional que la
-- atienda también. Por eso la lectura es `has_pet_access` **o** `is_vet()`, la
-- misma regla que rige la ficha.
--
-- Subir y borrar queda en el profesional: es parte de una atención.
-- ============================================================================
CREATE POLICY "medical_studies_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'medical-studies'
    AND (has_pet_access(storage_pet_id(name)) OR is_vet())
  );

CREATE POLICY "medical_studies_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'medical-studies' AND is_vet());

CREATE POLICY "medical_studies_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'medical-studies' AND is_vet());
