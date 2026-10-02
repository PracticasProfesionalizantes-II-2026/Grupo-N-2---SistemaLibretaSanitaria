-- ============================================================================
-- PetCloud — Migración 007: el registro sanitario sobrevive a la baja de cuenta
--
-- Quién cargó una vacuna es un dato de auditoría; **que la vacuna existe** es un
-- dato clínico. Hasta ahora los dos estaban atados: `created_by_id` referenciaba
-- `profiles(id)` sin `ON DELETE`, o sea con RESTRICT, y eso volvía imposible
-- borrar a alguien que alguna vez hubiera cargado algo.
--
-- El caso concreto que importa: alguien comparte su mascota con permiso de
-- edición, esa persona carga una vacuna y después se da de baja. Con RESTRICT,
-- la baja falla por un registro que ni siquiera es de su mascota. Con SET NULL,
-- la vacuna se queda donde tiene que estar —en la libreta del animal— y lo único
-- que se pierde es el nombre de quien la anotó.
--
-- Consecuencia obligada: las columnas pasan a aceptar NULL. `SET NULL` sobre una
-- columna `NOT NULL` no se puede: al intentar el borrado, PostgreSQL escribiría
-- NULL y violaría su propia restricción.
--
-- Qué NO cambia, y a propósito:
--
--   pets.owner_id            CASCADE   una mascota sin dueño no es nada
--   reminders.owner_id       CASCADE   un recordatorio sin destinatario tampoco
--   notifications.user_id    CASCADE   ídem
--
-- Es decir: quien se da de baja se lleva sus mascotas y todo lo que cuelga de
-- ellas. Lo que sobrevive es lo que cargó en la mascota **de otra persona**.
-- ============================================================================

-- vaccinations ---------------------------------------------------------------
ALTER TABLE vaccinations ALTER COLUMN created_by_id DROP NOT NULL;
ALTER TABLE vaccinations DROP CONSTRAINT IF EXISTS vaccinations_created_by_id_fkey;
ALTER TABLE vaccinations ADD CONSTRAINT vaccinations_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- dewormings -----------------------------------------------------------------
ALTER TABLE dewormings ALTER COLUMN created_by_id DROP NOT NULL;
ALTER TABLE dewormings DROP CONSTRAINT IF EXISTS dewormings_created_by_id_fkey;
ALTER TABLE dewormings ADD CONSTRAINT dewormings_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- medications ----------------------------------------------------------------
ALTER TABLE medications ALTER COLUMN created_by_id DROP NOT NULL;
ALTER TABLE medications DROP CONSTRAINT IF EXISTS medications_created_by_id_fkey;
ALTER TABLE medications ADD CONSTRAINT medications_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- conditions -----------------------------------------------------------------
ALTER TABLE conditions ALTER COLUMN created_by_id DROP NOT NULL;
ALTER TABLE conditions DROP CONSTRAINT IF EXISTS conditions_created_by_id_fkey;
ALTER TABLE conditions ADD CONSTRAINT conditions_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- weight_records -------------------------------------------------------------
ALTER TABLE weight_records ALTER COLUMN created_by_id DROP NOT NULL;
ALTER TABLE weight_records DROP CONSTRAINT IF EXISTS weight_records_created_by_id_fkey;
ALTER TABLE weight_records ADD CONSTRAINT weight_records_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- pet_documents --------------------------------------------------------------
ALTER TABLE pet_documents ALTER COLUMN uploaded_by_id DROP NOT NULL;
ALTER TABLE pet_documents DROP CONSTRAINT IF EXISTS pet_documents_uploaded_by_id_fkey;
ALTER TABLE pet_documents ADD CONSTRAINT pet_documents_uploaded_by_id_fkey
  FOREIGN KEY (uploaded_by_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- pet_notes ------------------------------------------------------------------
--
-- La nota es la excepción que confirma la regla: no es un dato clínico sino el
-- comentario personal de alguien ("le tiene miedo a la aspiradora"). Igual va
-- con SET NULL y no CASCADE, porque quien queda con la mascota suele necesitar
-- justamente esas notas — son las que explican cómo tratarla.
ALTER TABLE pet_notes ALTER COLUMN created_by_id DROP NOT NULL;
ALTER TABLE pet_notes DROP CONSTRAINT IF EXISTS pet_notes_created_by_id_fkey;
ALTER TABLE pet_notes ADD CONSTRAINT pet_notes_created_by_id_fkey
  FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN vaccinations.created_by_id IS
  'Quién la anotó. NULL si esa cuenta se dio de baja: el registro clínico se conserva, la atribución no.';
