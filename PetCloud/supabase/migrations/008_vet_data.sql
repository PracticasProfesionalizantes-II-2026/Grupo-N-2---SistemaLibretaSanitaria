-- ============================================================================
-- PetCloud — Migración 008: datos del veterinario
--
-- Abre la escritura de la historia clínica —que la 002 dejó deliberadamente sin
-- políticas de INSERT— y agrega las dos tablas que le faltan al panel: la cola
-- de la sala de espera y los presets de vacuna del modo campaña.
--
-- La regla de acceso de esta fase: **el permiso lo da la matrícula, no un
-- vínculo previo**. Cualquier veterinario puede atender a cualquier mascota que
-- le llegue por QR, porque en la vida real eso es exactamente lo que pasa: el
-- animal aparece en la guardia y hay que atenderlo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Presets de vacuna
--
-- Lo que el veterinario repetiría a mano en cada dosis de una campaña. Se eligen
-- una vez y después solo se escanean QR.
--
-- `species` es un **arreglo** y no una columna simple: la antirrábica es para
-- perro y gato a la vez, y la pantalla ya muestra "Perro y Gato". Con una sola
-- especie por fila habría que duplicar el preset y mantener los dos.
-- ----------------------------------------------------------------------------
CREATE TABLE vaccine_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  vaccine_name TEXT NOT NULL,
  manufacturer TEXT,
  application_route application_route,
  species pet_species[] NOT NULL DEFAULT '{}',
  default_dose_number TEXT,
  booster_interval_days INTEGER,
  initial_series_interval_days INTEGER,
  -- Las obligatorias por ordenanza aparecen primero y preseleccionadas.
  is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vaccine_presets_institution ON vaccine_presets(institution_id);

CREATE TRIGGER vaccine_presets_updated_at
  BEFORE UPDATE ON vaccine_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Sala de espera
--
-- No es una agenda: es una cola. La veterinaria atiende por orden de llegada y
-- `checked_in_at` es el dato que ordena, con las urgencias adelante. No hay
-- horario reservado porque el producto no tiene turnos.
-- ----------------------------------------------------------------------------
CREATE TYPE visit_status AS ENUM (
  'waiting',
  'in_progress',
  'completed',
  'cancelled',
  'no_show'
);

CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  -- Se completa sola desde la mascota (ver `visits_set_owner`): es lo que le
  -- permite al dueño ver la visita, y no puede depender de lo que mande el
  -- mostrador.
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by_id UUID REFERENCES vet_professionals(id),
  status visit_status NOT NULL DEFAULT 'waiting',
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visits_institution_status ON visits(institution_id, status);
CREATE INDEX idx_visits_pet ON visits(pet_id);

CREATE TRIGGER visits_updated_at
  BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- FUNCIONES AUXILIARES
--
-- Todas `SECURITY DEFINER` con `search_path` fijo, y cada una lee **una sola
-- tabla**: es la regla que quedó de la migración 005 — una política de RLS nunca
-- consulta directo otra tabla con RLS, porque ahí es donde aparecen las
-- recursiones entre políticas.
-- ============================================================================

/** ¿Es veterinario, con matrícula validada o sin validar? */
CREATE OR REPLACE FUNCTION is_vet()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vet_professionals WHERE profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

/** ¿Tiene la matrícula validada? Es lo único que habilita a firmar. */
CREATE OR REPLACE FUNCTION is_validated_vet()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vet_professionals
    WHERE profile_id = auth.uid() AND license_validated = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

/**
 * Su ficha de profesional y su institución.
 *
 * `LIMIT 1` porque el esquema no impide que alguien figure en dos veterinarias;
 * hoy nadie lo hace y la aplicación asume una. Si eso cambia, esto es lo primero
 * que hay que revisar.
 */
CREATE OR REPLACE FUNCTION my_vet_professional_id()
RETURNS UUID AS $$
  SELECT id FROM vet_professionals WHERE profile_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION my_vet_institution_id()
RETURNS UUID AS $$
  SELECT institution_id FROM vet_professionals
  WHERE profile_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

/** El dueño de una mascota, para completar `visits.owner_id`. */
CREATE OR REPLACE FUNCTION pet_owner_id(p_pet_id UUID)
RETURNS UUID AS $$
  SELECT owner_id FROM pets WHERE id = p_pet_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- Firmar exige matrícula validada — y lo hace cumplir la base
--
-- La condición podría vivir solo en el Server Action, pero entonces sería un
-- acuerdo de caballeros: cualquiera con una sesión de veterinario puede llamar a
-- PostgREST directo y mandar `is_signed: true`. Lo que le da valor sanitario a
-- una firma es justamente que no se pueda poner sin matrícula, así que la
-- comprobación va donde no se puede esquivar.
--
-- Se mira el estado **al momento de firmar**. Si mañana le revocan la
-- validación, lo ya firmado no se retracta: eso sería reescribir la historia
-- clínica, y no es una decisión de esta fase.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_signature_requires_license()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_signed
     AND (TG_OP = 'INSERT' OR NOT OLD.is_signed)
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND NOT is_validated_vet()
  THEN
    RAISE EXCEPTION 'Solo un profesional con matrícula validada puede firmar un registro clínico.';
  END IF;

  -- Firmado y borrador son estados opuestos: no se publican borradores.
  IF NEW.is_signed THEN
    NEW.is_draft := FALSE;
    NEW.signed_at := COALESCE(NEW.signed_at, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER medical_records_enforce_signature
  BEFORE INSERT OR UPDATE ON medical_records
  FOR EACH ROW EXECUTE FUNCTION enforce_signature_requires_license();

-- ----------------------------------------------------------------------------
-- El dueño de la visita sale de la mascota, no del formulario
--
-- `owner_id` es lo que hace que el dueño vea su propia visita. Si lo mandara el
-- mostrador, un valor equivocado le mostraría la visita a otra persona. Se
-- ignora lo que venga y se completa desde `pets`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION visits_set_owner()
RETURNS TRIGGER AS $$
BEGIN
  NEW.owner_id := pet_owner_id(NEW.pet_id);

  IF NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'La mascota no existe o no tiene dueño.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER visits_set_owner_before_write
  BEFORE INSERT OR UPDATE OF pet_id ON visits
  FOR EACH ROW EXECUTE FUNCTION visits_set_owner();

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Las políticas del mismo comando se combinan con OR. Las de abajo **suman** la
-- vía del veterinario a las que la 002 escribió para el dueño; por eso solo
-- mencionan `is_vet()` y no repiten `has_pet_access`, que ya está cubierto.
-- ============================================================================

ALTER TABLE vaccine_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------ medical_records
--
-- En la 002 esta tabla quedó con SELECT solamente y un comentario explicando por
-- qué. Acá se abren INSERT y UPDATE, atados a que el registro esté firmado por
-- quien lo escribe: nadie carga una consulta a nombre de otro profesional.
CREATE POLICY "medical_records_select_vet" ON medical_records FOR SELECT
  USING (is_vet());

CREATE POLICY "medical_records_insert_vet" ON medical_records FOR INSERT
  WITH CHECK (
    vet_professional_id = my_vet_professional_id()
    AND institution_id = my_vet_institution_id()
  );

CREATE POLICY "medical_records_update_vet" ON medical_records FOR UPDATE
  USING (vet_professional_id = my_vet_professional_id())
  WITH CHECK (vet_professional_id = my_vet_professional_id());

-- --------------------------------------------------------------- vaccinations
--
-- La vía del dueño (002) inserta con `created_by_id = auth.uid()` y
-- `verified: false`. Esta agrega la del profesional, que aplica la dosis y la
-- deja verificada.
CREATE POLICY "vaccinations_select_vet" ON vaccinations FOR SELECT
  USING (is_vet());

CREATE POLICY "vaccinations_insert_vet" ON vaccinations FOR INSERT
  WITH CHECK (applied_by_id = my_vet_professional_id());

CREATE POLICY "vaccinations_update_vet" ON vaccinations FOR UPDATE
  USING (applied_by_id = my_vet_professional_id())
  WITH CHECK (applied_by_id = my_vet_professional_id());

-- ----------------------------------------------------------------- dewormings
CREATE POLICY "dewormings_select_vet" ON dewormings FOR SELECT
  USING (is_vet());

CREATE POLICY "dewormings_insert_vet" ON dewormings FOR INSERT
  WITH CHECK (applied_by_id = my_vet_professional_id());

-- ----------------------------------------------------------------------- pets
--
-- **La política más amplia del sistema.** Cualquier veterinario puede leer
-- cualquier mascota, sin vínculo previo, porque es lo que exige atender por QR:
-- el animal llega a la guardia y hay que ver su historia antes de tocarlo.
--
-- Es lectura y nada más: editar y borrar siguen siendo del dueño (políticas de
-- la 002 y la 005, que conviven con esta por OR).
CREATE POLICY "pets_select_vet" ON pets FOR SELECT
  USING (is_vet());

-- Lo mismo para lo que cuelga de la ficha y el veterinario necesita leer antes
-- de recetar: una alergia a la penicilina tiene que estar visible.
CREATE POLICY "conditions_select_vet" ON conditions FOR SELECT
  USING (is_vet());

CREATE POLICY "medications_select_vet" ON medications FOR SELECT
  USING (is_vet());

CREATE POLICY "weight_records_select_vet" ON weight_records FOR SELECT
  USING (is_vet());

CREATE POLICY "pet_documents_select_vet" ON pet_documents FOR SELECT
  USING (is_vet());

-- Las notas del dueño **no** se abren: son su comentario personal, no un dato
-- clínico. Si algo de ahí importa para atender, se carga como condición.

-- ------------------------------------------------------------ vaccine_presets
CREATE POLICY "vaccine_presets_select" ON vaccine_presets FOR SELECT
  USING (institution_id = my_vet_institution_id());

CREATE POLICY "vaccine_presets_insert" ON vaccine_presets FOR INSERT
  WITH CHECK (institution_id = my_vet_institution_id());

CREATE POLICY "vaccine_presets_update" ON vaccine_presets FOR UPDATE
  USING (institution_id = my_vet_institution_id())
  WITH CHECK (institution_id = my_vet_institution_id());

CREATE POLICY "vaccine_presets_delete" ON vaccine_presets FOR DELETE
  USING (institution_id = my_vet_institution_id());

-- --------------------------------------------------------------------- visits
--
-- La cola es de la institución; el dueño ve las visitas de sus mascotas. Cerrar
-- o cancelar es del mostrador, así que el dueño solo lee.
CREATE POLICY "visits_select" ON visits FOR SELECT
  USING (institution_id = my_vet_institution_id() OR owner_id = auth.uid());

CREATE POLICY "visits_insert" ON visits FOR INSERT
  WITH CHECK (institution_id = my_vet_institution_id());

CREATE POLICY "visits_update" ON visits FOR UPDATE
  USING (institution_id = my_vet_institution_id())
  WITH CHECK (institution_id = my_vet_institution_id());
