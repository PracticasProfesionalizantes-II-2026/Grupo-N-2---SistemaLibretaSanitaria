-- ============================================================================
-- PetCloud — Migración 002: datos del dueño de mascota
--
-- La mascota y todo lo que cuelga de ella: historia clínica, vacunas,
-- antiparasitarios, medicación, enfermedades, peso, documentos, notas,
-- recordatorios y notificaciones.
--
-- Depende de la 001 (profiles, vet_institutions, vet_professionals) y reusa su
-- trigger `update_updated_at()`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
CREATE TYPE pet_species AS ENUM ('dog', 'cat', 'other');
CREATE TYPE pet_sex AS ENUM ('male', 'female');
CREATE TYPE lost_status AS ENUM ('safe', 'lost', 'found');
CREATE TYPE record_type AS ENUM ('checkup', 'emergency', 'surgery', 'vaccination', 'deworming', 'other');
CREATE TYPE application_route AS ENUM ('injectable', 'oral', 'nasal', 'topical', 'other');
CREATE TYPE deworming_type AS ENUM ('internal', 'external', 'both');
CREATE TYPE condition_type AS ENUM ('disease', 'allergy', 'chronic');
CREATE TYPE weight_source AS ENUM ('owner', 'vet');
CREATE TYPE document_type AS ENUM ('study', 'prescription', 'certificate', 'other');
CREATE TYPE reminder_repeat AS ENUM ('once', 'daily', 'weekly', 'monthly', 'yearly');
CREATE TYPE reminder_channel AS ENUM ('push', 'email', 'both');
CREATE TYPE reminder_source AS ENUM ('manual', 'auto_vaccine', 'auto_deworming', 'auto_visit');
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'dismissed');
CREATE TYPE notification_type AS ENUM ('reminder', 'campaign', 'visit', 'lost_pet', 'system');
CREATE TYPE share_permission AS ENUM ('view', 'edit');

-- ----------------------------------------------------------------------------
-- Mascotas
--
-- `qr_code` es el código impreso en el collar: único en todo el sistema y, una
-- vez asignado, inmutable (ver el trigger `pets_protect_qr_code` más abajo).
-- Las columnas `lost_*` se crean ahora para no volver a tocar la tabla, pero la
-- búsqueda de mascotas perdidas es de una fase posterior y todavía nada las usa.
-- ----------------------------------------------------------------------------
CREATE TABLE pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species pet_species NOT NULL,
  breed TEXT,
  date_of_birth DATE,
  sex pet_sex,
  weight NUMERIC(5,2),
  color TEXT,
  neutered BOOLEAN NOT NULL DEFAULT FALSE,
  microchip_number TEXT,
  blood_type TEXT,
  photo_url TEXT,
  qr_code TEXT NOT NULL UNIQUE,
  qr_public_config JSONB NOT NULL DEFAULT '{"show_owner_contact": false}',
  primary_vet_institution_id UUID REFERENCES vet_institutions(id),
  municipal_registry_number TEXT,
  lost_status lost_status NOT NULL DEFAULT 'safe',
  lost_at TIMESTAMPTZ,
  lost_radius_km NUMERIC(4,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pets_owner ON pets(owner_id);
CREATE INDEX idx_pets_qr ON pets(qr_code);

CREATE TRIGGER pets_updated_at
  BEFORE UPDATE ON pets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Códigos de collar, con su historia
--
-- `pets.qr_code` es el código vigente; acá quedan todos los que tuvo la mascota,
-- con su fecha de baja. Existe por un caso concreto: si a alguien le roban o
-- pierde el collar y regenera el código, el collar viejo sigue dando vueltas.
-- Sin esta tabla, quien lo escanee lee "mascota no encontrada" —lo mismo que
-- diría un QR inventado— justo cuando quizá encontró al animal. Con ella se le
-- puede decir que ese collar fue dado de baja y ofrecerle avisar igual.
--
-- El UNIQUE es sobre esta tabla y no sobre `pets`: es lo que garantiza que un
-- código dado de baja **nunca** se le asigne a otra mascota. El de `pets` solo
-- cubre los vigentes, así que el generador tiene que verificar contra acá.
-- ----------------------------------------------------------------------------
CREATE TABLE pet_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pet_qr_codes_pet ON pet_qr_codes(pet_id);
CREATE INDEX idx_pet_qr_codes_code ON pet_qr_codes(code);

-- ----------------------------------------------------------------------------
-- Accesos compartidos
--
-- Una mascota es de una persona, pero la cuida más de una: la pareja, quien la
-- pasea, la familia que la tiene el fin de semana. Compartir da lectura o
-- edición sobre la ficha, nunca la propiedad.
-- ----------------------------------------------------------------------------
CREATE TABLE pet_shared_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  shared_with_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission share_permission NOT NULL DEFAULT 'view',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pet_id, shared_with_id)
);

CREATE TRIGGER pet_shared_access_updated_at
  BEFORE UPDATE ON pet_shared_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Historia clínica
--
-- La escribe el veterinario (fase 3). Se crea entera ahora para que las tablas
-- de vacunas, antiparasitarios y medicación puedan referenciarla desde ya.
-- ----------------------------------------------------------------------------
CREATE TABLE medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  vet_professional_id UUID REFERENCES vet_professionals(id),
  institution_id UUID REFERENCES vet_institutions(id),
  type record_type NOT NULL DEFAULT 'checkup',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  diagnosis TEXT,
  observations TEXT,
  weight_at_visit NUMERIC(5,2),
  next_visit_date DATE,
  is_signed BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at TIMESTAMPTZ,
  is_draft BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_medical_records_pet ON medical_records(pet_id);

CREATE TRIGGER medical_records_updated_at
  BEFORE UPDATE ON medical_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Vacunaciones
--
-- `verified` separa lo que cargó el dueño de memoria o de la libreta de papel de
-- lo que firmó un profesional con matrícula. Las dos cosas valen para el dueño;
-- para el municipio, solo la segunda.
-- ----------------------------------------------------------------------------
CREATE TABLE vaccinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  vaccine_name TEXT NOT NULL,
  manufacturer TEXT,
  lot_number TEXT,
  dose_number TEXT,
  application_route application_route,
  applied_at DATE NOT NULL,
  next_dose_at DATE,
  location TEXT,
  applied_by_id UUID REFERENCES vet_professionals(id),
  campaign_id UUID,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vaccinations_pet ON vaccinations(pet_id);

CREATE TRIGGER vaccinations_updated_at
  BEFORE UPDATE ON vaccinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Antiparasitarios
-- ----------------------------------------------------------------------------
CREATE TABLE dewormings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  type deworming_type NOT NULL,
  applied_at DATE NOT NULL,
  next_application_at DATE,
  applied_by_id UUID REFERENCES vet_professionals(id),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dewormings_pet ON dewormings(pet_id);

CREATE TRIGGER dewormings_updated_at
  BEFORE UPDATE ON dewormings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Medicación
-- ----------------------------------------------------------------------------
CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  administration_route TEXT,
  start_date DATE,
  end_date DATE,
  instructions TEXT,
  owner_notes TEXT,
  prescribed_by_id UUID REFERENCES vet_professionals(id),
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_medications_pet ON medications(pet_id);

CREATE TRIGGER medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Enfermedades y alergias
--
-- Es la tabla que la veterinaria lee primero: una alergia a la penicilina tiene
-- que estar arriba de todo antes de recetar nada.
-- ----------------------------------------------------------------------------
CREATE TABLE conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type condition_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  diagnosed_at DATE,
  diagnosed_by_id UUID REFERENCES vet_professionals(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conditions_pet ON conditions(pet_id);

CREATE TRIGGER conditions_updated_at
  BEFORE UPDATE ON conditions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Peso
--
-- `source` distingue la balanza de casa de la de la veterinaria. Importa para
-- leer el gráfico: los saltos suelen ser de cambio de balanza, no del animal.
-- ----------------------------------------------------------------------------
CREATE TABLE weight_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  value NUMERIC(5,2) NOT NULL,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  source weight_source NOT NULL DEFAULT 'owner',
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_weight_records_pet ON weight_records(pet_id);

CREATE TRIGGER weight_records_updated_at
  BEFORE UPDATE ON weight_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Documentos adjuntos
--
-- El archivo vive en el bucket `pet-documents`, que es privado. Acá queda la
-- referencia y los metadatos con los que se lista.
-- ----------------------------------------------------------------------------
CREATE TABLE pet_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type document_type NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by_id UUID NOT NULL REFERENCES profiles(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pet_documents_pet ON pet_documents(pet_id);

CREATE TRIGGER pet_documents_updated_at
  BEFORE UPDATE ON pet_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Notas libres del dueño
-- ----------------------------------------------------------------------------
CREATE TABLE pet_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pet_notes_pet ON pet_notes(pet_id);

CREATE TRIGGER pet_notes_updated_at
  BEFORE UPDATE ON pet_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Recordatorios
--
-- En esta fase solo los manuales. Los automáticos por vencimiento llegan en la
-- fase 5 y se distinguen por `source`, que es lo que decide si se pueden borrar.
-- ----------------------------------------------------------------------------
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  repeat reminder_repeat NOT NULL DEFAULT 'once',
  channel reminder_channel NOT NULL DEFAULT 'push',
  source reminder_source NOT NULL DEFAULT 'manual',
  source_id UUID,
  status reminder_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_owner ON reminders(owner_id);
CREATE INDEX idx_reminders_pet ON reminders(pet_id);

CREATE TRIGGER reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Notificaciones
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ¿QUIÉN PUEDE VER ESTA MASCOTA?
--
-- Una sola función responde por todas las tablas hijas. `SECURITY DEFINER` no es
-- una comodidad: sin eso, la política de SELECT de `pets` llamaría a esta
-- función, que vuelve a leer `pets`, que dispara la política otra vez —
-- recursión infinita, el error clásico de RLS que se consulta a sí misma.
-- Corriendo como dueña de la función se saltea RLS y el ciclo se corta.
--
-- `search_path` fijo porque toda función SECURITY DEFINER que no lo fije puede
-- ser desviada a tablas de otro esquema por quien controle el search_path.
-- ============================================================================
CREATE OR REPLACE FUNCTION has_pet_access(
  p_pet_id UUID,
  p_min_permission share_permission DEFAULT 'view'
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets
    WHERE id = p_pet_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM pet_shared_access
    WHERE pet_id = p_pet_id
      AND shared_with_id = auth.uid()
      AND (p_min_permission = 'view' OR permission = 'edit')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- La mascota no cambia de dueño por un UPDATE
--
-- `pets_update` deja escribir a quien tenga permiso de edición, y `owner_id` es
-- una columna más de esa fila. RLS evalúa el WITH CHECK contra la fila nueva,
-- pero `has_pet_access` lee el valor todavía comprometido en la tabla: alguien
-- con acceso compartido de edición podría ponerse como dueño y quedarse con la
-- mascota. Igual que con el rol en la 001, lo ataja un trigger.
--
-- Transferir una mascota es una operación real (una adopción), pero merece su
-- propio flujo con aceptación de las dos partes, no un UPDATE silencioso.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_pet_ownership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
  THEN
    RAISE EXCEPTION 'La mascota no puede cambiar de dueño desde una edición común.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pets_protect_ownership
  BEFORE UPDATE ON pets
  FOR EACH ROW EXECUTE FUNCTION protect_pet_ownership();

-- ----------------------------------------------------------------------------
-- Cada código de collar queda registrado
--
-- La aplicación solo escribe `pets.qr_code`; la historia la lleva este trigger.
-- Al crear la mascota anota el primer código, y cuando cambia da de baja el
-- anterior y anota el nuevo. Nadie tiene que acordarse de hacerlo a mano, que es
-- exactamente la clase de cosa que se olvida y deja el rastro incompleto.
--
-- `SECURITY DEFINER` porque `pet_qr_codes` tiene RLS y quien dispara el cambio
-- es el dueño desde el navegador, no el servidor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_pet_qr_code()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pet_qr_codes (pet_id, code) VALUES (NEW.id, NEW.qr_code);
    RETURN NEW;
  END IF;

  IF NEW.qr_code IS DISTINCT FROM OLD.qr_code THEN
    UPDATE pet_qr_codes
    SET revoked_at = now()
    WHERE pet_id = NEW.id AND code = OLD.qr_code AND revoked_at IS NULL;

    INSERT INTO pet_qr_codes (pet_id, code) VALUES (NEW.id, NEW.qr_code);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER pets_track_qr_code
  AFTER INSERT OR UPDATE ON pets
  FOR EACH ROW EXECUTE FUNCTION track_pet_qr_code();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_shared_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dewormings ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------- pets
CREATE POLICY "pets_select" ON pets FOR SELECT
  USING (has_pet_access(id));

CREATE POLICY "pets_insert" ON pets FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "pets_update" ON pets FOR UPDATE
  USING (has_pet_access(id, 'edit'));

-- Borrar una mascota borra su historia clínica en cascada: eso lo decide quien
-- es dueño, no quien tiene acceso compartido de edición.
CREATE POLICY "pets_delete" ON pets FOR DELETE
  USING (owner_id = auth.uid());

-- -------------------------------------------------------------- pet_qr_codes
--
-- Solo lectura, y solo para quien ya tiene acceso a la mascota: sirve para
-- mostrarle al dueño qué códigos tuvo y cuándo los dio de baja. Las filas las
-- escribe el trigger, no la aplicación, así que no hay política de escritura.
--
-- La consulta pública —quien encuentra un collar y lo escanea sin tener cuenta—
-- no pasa por acá: va a necesitar una función `SECURITY DEFINER` que devuelva
-- solo lo justo, y se resuelve en la fase de mascota perdida junto con el resto
-- de esa pantalla.
CREATE POLICY "pet_qr_codes_select" ON pet_qr_codes FOR SELECT
  USING (has_pet_access(pet_id));

-- ------------------------------------------------------- pet_shared_access
CREATE POLICY "shared_access_select" ON pet_shared_access FOR SELECT
  USING (
    shared_with_id = auth.uid()
    OR EXISTS (SELECT 1 FROM pets WHERE id = pet_id AND owner_id = auth.uid())
  );

CREATE POLICY "shared_access_insert" ON pet_shared_access FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM pets WHERE id = pet_id AND owner_id = auth.uid()));

CREATE POLICY "shared_access_update" ON pet_shared_access FOR UPDATE
  USING (EXISTS (SELECT 1 FROM pets WHERE id = pet_id AND owner_id = auth.uid()));

CREATE POLICY "shared_access_delete" ON pet_shared_access FOR DELETE
  USING (EXISTS (SELECT 1 FROM pets WHERE id = pet_id AND owner_id = auth.uid()));

-- --------------------------------------------------------- medical_records
--
-- Solo SELECT, a propósito. La historia clínica la escribe un profesional con
-- matrícula: es lo que le da valor sanitario frente al municipio, y si el dueño
-- pudiera editarla dejaría de ser un documento y pasaría a ser una declaración.
--
-- No se escribe `WITH CHECK (false)`: con RLS activa, una tabla sin política de
-- INSERT ya rechaza todo. Dejarlo así hace que la fase 3 solo tenga que
-- *agregar* las políticas del veterinario, sin borrar nada de esta migración.
CREATE POLICY "medical_records_select" ON medical_records FOR SELECT
  USING (has_pet_access(pet_id));

-- -------------------------------------------------------------- vaccinations
CREATE POLICY "vaccinations_select" ON vaccinations FOR SELECT
  USING (has_pet_access(pet_id));
CREATE POLICY "vaccinations_insert" ON vaccinations FOR INSERT
  WITH CHECK (has_pet_access(pet_id, 'edit'));
CREATE POLICY "vaccinations_update" ON vaccinations FOR UPDATE
  USING (has_pet_access(pet_id, 'edit'));
CREATE POLICY "vaccinations_delete" ON vaccinations FOR DELETE
  USING (has_pet_access(pet_id, 'edit'));

-- ---------------------------------------------------------------- dewormings
CREATE POLICY "dewormings_select" ON dewormings FOR SELECT
  USING (has_pet_access(pet_id));
CREATE POLICY "dewormings_insert" ON dewormings FOR INSERT
  WITH CHECK (has_pet_access(pet_id, 'edit'));
CREATE POLICY "dewormings_update" ON dewormings FOR UPDATE
  USING (has_pet_access(pet_id, 'edit'));
CREATE POLICY "dewormings_delete" ON dewormings FOR DELETE
  USING (has_pet_access(pet_id, 'edit'));

-- --------------------------------------------------------------- medications
CREATE POLICY "medications_select" ON medications FOR SELECT
  USING (has_pet_access(pet_id));
CREATE POLICY "medications_insert" ON medications FOR INSERT
  WITH CHECK (has_pet_access(pet_id, 'edit'));
CREATE POLICY "medications_update" ON medications FOR UPDATE
  USING (has_pet_access(pet_id, 'edit'));
CREATE POLICY "medications_delete" ON medications FOR DELETE
  USING (has_pet_access(pet_id, 'edit'));

-- ---------------------------------------------------------------- conditions
CREATE POLICY "conditions_select" ON conditions FOR SELECT
  USING (has_pet_access(pet_id));
CREATE POLICY "conditions_insert" ON conditions FOR INSERT
  WITH CHECK (has_pet_access(pet_id, 'edit'));
CREATE POLICY "conditions_update" ON conditions FOR UPDATE
  USING (has_pet_access(pet_id, 'edit'));
CREATE POLICY "conditions_delete" ON conditions FOR DELETE
  USING (has_pet_access(pet_id, 'edit'));

-- ------------------------------------------------------------ weight_records
CREATE POLICY "weight_records_select" ON weight_records FOR SELECT
  USING (has_pet_access(pet_id));
CREATE POLICY "weight_records_insert" ON weight_records FOR INSERT
  WITH CHECK (has_pet_access(pet_id, 'edit'));
CREATE POLICY "weight_records_update" ON weight_records FOR UPDATE
  USING (has_pet_access(pet_id, 'edit'));
CREATE POLICY "weight_records_delete" ON weight_records FOR DELETE
  USING (has_pet_access(pet_id, 'edit'));

-- ------------------------------------------------------------- pet_documents
CREATE POLICY "pet_documents_select" ON pet_documents FOR SELECT
  USING (has_pet_access(pet_id));
CREATE POLICY "pet_documents_insert" ON pet_documents FOR INSERT
  WITH CHECK (has_pet_access(pet_id, 'edit'));
CREATE POLICY "pet_documents_update" ON pet_documents FOR UPDATE
  USING (has_pet_access(pet_id, 'edit'));
CREATE POLICY "pet_documents_delete" ON pet_documents FOR DELETE
  USING (has_pet_access(pet_id, 'edit'));

-- ----------------------------------------------------------------- pet_notes
CREATE POLICY "pet_notes_select" ON pet_notes FOR SELECT
  USING (has_pet_access(pet_id));
CREATE POLICY "pet_notes_insert" ON pet_notes FOR INSERT
  WITH CHECK (has_pet_access(pet_id, 'edit'));
CREATE POLICY "pet_notes_update" ON pet_notes FOR UPDATE
  USING (has_pet_access(pet_id, 'edit'));
CREATE POLICY "pet_notes_delete" ON pet_notes FOR DELETE
  USING (has_pet_access(pet_id, 'edit'));

-- ----------------------------------------------------------------- reminders
CREATE POLICY "reminders_select" ON reminders FOR SELECT
  USING (owner_id = auth.uid());
CREATE POLICY "reminders_insert" ON reminders FOR INSERT
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "reminders_update" ON reminders FOR UPDATE
  USING (owner_id = auth.uid());

-- Los automáticos no se borran, se descartan (`status = 'dismissed'`): son el
-- rastro de un vencimiento real y borrarlos escondería que la fecha pasó.
CREATE POLICY "reminders_delete" ON reminders FOR DELETE
  USING (owner_id = auth.uid() AND source = 'manual');

-- ------------------------------------------------------------- notifications
--
-- Sin política de INSERT: las notificaciones las genera el sistema desde el
-- servidor, no el navegador de quien las recibe.
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  USING (user_id = auth.uid());
