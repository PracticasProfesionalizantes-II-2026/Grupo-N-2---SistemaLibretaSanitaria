-- 016 · El veterinario deja documentos en la ficha de sus pacientes
--
-- El panel promete que un certificado firmado "queda disponible para el dueño en
-- la sección Documentos". Hoy no puede cumplirlo: `pet_documents_insert` de la
-- 002 exige `has_pet_access(pet_id, 'edit')`, que solo mira `pets.owner_id` y
-- `pet_shared_access`. El veterinario no entra por ninguna de las dos. La 008 le
-- abrió la lectura (`pet_documents_select_vet`) y ahí se quedó: puede ver los
-- estudios que sube el dueño pero no puede escribir el certificado que él mismo
-- firma.
--
-- Lo que se abre acá es la escritura, y con el alcance más chico que sirve: los
-- pacientes de la casa. No "las mascotas", no "los pacientes del sistema" — las
-- que ya pasaron por esta institución. Que cualquier matrícula del país pueda
-- dejar un PDF en la ficha sanitaria de cualquier animal sería un padrón
-- abierto para escritura, no una cartera de pacientes.

/**
 * ¿Esta mascota es paciente de mi institución?
 *
 * "Paciente" es la misma definición que ya usa el listado del panel: la mascota
 * pasó por acá, y eso quedó registrado como una visita o como un registro
 * clínico. No hay un vínculo explícito que dar de alta ni que revocar; la
 * relación la crea la atención y se corta sola cuando no existe.
 *
 * SECURITY DEFINER porque adentro lee `visits`, `medical_records` y
 * `vet_professionals` sin que se evalúen sus políticas: es lo que evita que una
 * política de `pet_documents` termine consultando tablas cuyas políticas miran
 * al mismo profesional.
 *
 * Un borrador cuenta: la consulta que se está escribiendo ya es una atención de
 * esta casa, y el certificado suele emitirse antes de que se firme el registro.
 */
CREATE OR REPLACE FUNCTION is_my_patient(p_pet_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM visits
    WHERE pet_id = p_pet_id
      AND institution_id = my_vet_institution_id()
  ) OR EXISTS (
    SELECT 1 FROM medical_records
    WHERE pet_id = p_pet_id
      AND institution_id = my_vet_institution_id()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Las dos consultas de arriba filtran por mascota **y** institución a la vez.
-- Los índices que hay son de una columna sola (la 008 y la 012), así que este
-- chequeo —que corre en cada INSERT y en cada objeto del bucket— se comería un
-- filtro extra sobre todas las visitas de la mascota.
CREATE INDEX IF NOT EXISTS idx_visits_pet_institution
  ON visits(pet_id, institution_id);

CREATE INDEX IF NOT EXISTS idx_medical_records_pet_institution
  ON medical_records(pet_id, institution_id);

-- ----------------------------------------------------------------------------
-- pet_documents
--
-- Convive por OR con `pet_documents_insert` de la 002: el dueño sigue subiendo
-- sus estudios como siempre. Esta política solo agrega el camino del profesional.
--
-- Dos condiciones más allá del paciente:
--
--   `uploaded_by_id = auth.uid()` — un documento se sube a nombre propio. Poder
--   atribuirle a un colega un papel que él no emitió es la misma clase de
--   problema que firmar por él.
--
--   El certificado exige matrícula validada. Es exactamente el acto que una
--   matrícula habilita; la aplicación ya lo comprueba antes de escribir, pero
--   ahí es cortesía para explicarlo a tiempo. La regla vive acá, igual que la
--   firma de los registros clínicos vive en el trigger de la 008/009. Los demás
--   tipos —un estudio, una receta— no son actos que certifiquen nada por sí
--   mismos y no la piden.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "pet_documents_insert_vet" ON pet_documents;
CREATE POLICY "pet_documents_insert_vet" ON pet_documents FOR INSERT
  WITH CHECK (
    is_my_patient(pet_id)
    AND uploaded_by_id = auth.uid()
    AND (type <> 'certificate' OR is_validated_vet())
  );

-- Sin UPDATE ni DELETE: un documento emitido no se edita ni se borra desde el
-- panel. Un certificado mal emitido se reemplaza por otro, y los dos quedan.

-- ----------------------------------------------------------------------------
-- storage: bucket pet-documents
--
-- Misma convención de rutas que la 003 — `{pet_id}/{archivo}` — y de ella
-- depende todo: `storage_pet_id(name)` saca el id del primer segmento.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "pet_documents_insert_vet" ON storage.objects;
CREATE POLICY "pet_documents_insert_vet" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pet-documents'
    AND is_my_patient(storage_pet_id(name))
  );

-- El borrado existe por una sola razón: si el archivo sube pero la fila de
-- `pet_documents` no se inserta, la aplicación deshace la subida para no dejar
-- un huérfano ocupando lugar en el bucket, sin forma de listarlo ni de borrarlo.
--
-- Por eso está acotado a quien subió el archivo: el profesional puede borrar lo
-- que él mismo acaba de subir y nada más. Los estudios que subió el dueño no se
-- tocan.
--
-- Se miran las dos columnas a propósito. `storage.objects` tiene `owner` (uuid,
-- la vieja) y `owner_id` (text, la que la reemplazó), y cuál de las dos completa
-- la Storage API depende de su versión. Con una sola, si resulta ser la que
-- quedó nula, la política no coincide nunca y el borrado de rollback falla en
-- silencio dejando archivos huérfanos. Con las dos, el permiso es el mismo
-- —exactamente quien subió el archivo— sea cual sea la que esté poblada.
DROP POLICY IF EXISTS "pet_documents_delete_vet_own" ON storage.objects;
CREATE POLICY "pet_documents_delete_vet_own" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pet-documents'
    AND (owner = auth.uid() OR owner_id = auth.uid()::text)
    AND is_my_patient(storage_pet_id(name))
  );
