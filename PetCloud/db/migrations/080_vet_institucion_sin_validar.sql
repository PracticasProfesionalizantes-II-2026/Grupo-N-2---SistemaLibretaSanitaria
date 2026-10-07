-- ============================================================================
-- PetCloud — Migración 080: una veterinaria sin validar solo llega a sus
-- propios pacientes
--
-- EL AGUJERO QUE CIERRA
--
-- Cualquiera puede registrarse como veterinario: `signUpVet` crea la
-- institución (`validated = false`) y la ficha en `vet_professionals` con
-- service role, y desde ese momento `is_vet()` es true. Con eso:
--   1. `pets_select_vet` (008) y todas las `*_select_vet` clínicas
--      (medical_records, vaccinations, dewormings, medications, conditions,
--      weight_records, pet_documents) más `medical_studies_select` (010) son
--      `is_vet()` a secas: la cuenta recién creada lee la historia clínica de
--      TODAS las mascotas.
--   2. `visits_insert`, `medical_records_insert_vet`, `appointments_insert`,
--      `vaccinations_insert_vet` y `dewormings_insert_vet` aceptan cualquier
--      `pet_id`. Una visita inventada fabrica la relación que la 077 pide para
--      el contacto del dueño (`get_pet_owner_profile_for_vet`), y también la de
--      `is_my_patient()` / `owner_of_my_patient()` (`vet_reads_patient_owner`,
--      012): teléfono y dirección de quien quiera.
--   3. Los `*_update` de esas tablas solo miran institución/autor, así que se
--      podía tomar una visita propia y cambiarle el `pet_id` a una mascota
--      ajena: la misma relación fabricada por otra puerta.
--   4. `vaccinations_update_vet_verify_owner_loaded` (076) es `is_vet()`:
--      cualquier cuenta verifica cualquier dosis cargada por un dueño.
--   5. `medical_studies_insert/delete` (010) son `is_vet()`: cualquier cuenta
--      sube o BORRA estudios de cualquier mascota.
--
-- LA REGLA (decisión de producto del maintainer)
--
-- Una institución con `vet_institutions.validated = false` conserva todo lo
-- suyo —ERP (schema `erp`, no se toca acá), equipo, ajustes, su sala de
-- espera y sus pacientes— pero no llega a datos de mascotas ajenas sin que el
-- dueño la traiga. Las validadas siguen exactamente como antes.
--
--   lectura/escritura de datos de una mascota =
--       institución activa validada               (como antes: `is_vet()`)
--    OR la mascota ya es paciente de mi institución (`is_my_patient`)
--
-- La puerta de entrada para la clínica sin validar es el QR de autogestión de
-- la sala de espera (`waiting_room_self_check_in`, 053): lo escanea el DUEÑO,
-- es `SECURITY DEFINER` y crea la visita sin pasar por RLS. Esa visita es el
-- consentimiento, y a partir de ahí `is_my_patient` es true. Esta migración
-- no la toca.
--
-- Por qué `is_my_patient` y no "relación o turno" como la 077: el turno ya no
-- se puede crear para una mascota que no sea paciente (se cierra acá mismo),
-- así que para una clínica sin validar las dos cosas son lo mismo. Y la 077
-- sigue igual: su relación ahora solo se puede construir por caminos que
-- pasan por esta regla.
--
-- LOS HELPERS NUEVOS
--
-- `my_institution_is_validated()`: true si quien llama tiene una fila ACTIVA
-- en `vet_professionals` (removed_at IS NULL) y esa institución está
-- validada. Implica `is_vet()`, por eso reemplaza a esa guarda en lugar de
-- sumarse. Depende solo de quién consulta, no de la fila: va siempre envuelto
-- en `(SELECT …)` para que Postgres lo calcule una vez por consulta (InitPlan,
-- ver trampas-conocidas "envolver cada llamada en (SELECT …)"). Va PRIMERO en
-- el OR: para una validada el resto ni se evalúa.
--
-- `my_patient_pet_ids()`: los pacientes de mi institución como conjunto, para
-- las LECTURAS. `is_my_patient(pet_id)` es por fila y no se puede envolver;
-- medido con 50.000 mascotas, una búsqueda por nombre de una clínica sin
-- validar tardaba 8,6 s (el statement_timeout es 8 s). Con el conjunto es un
-- SubPlan hasheado que se arma una vez. Las ESCRITURAS siguen con
-- `is_my_patient`, que evalúa una sola fila.
--
-- `my_vet_institution_id()` Y `my_vet_professional_id()` AHORA FILTRAN LA BAJA
--
-- Las dos eran `LIMIT 1` sobre todas las filas de la persona, dadas de baja
-- incluidas (058): quien fue sacado de una clínica seguía resolviendo a ella
-- en `visits_insert`, `is_my_patient`, las firmas, el ERP
-- (`erp.my_institution_id()` la envuelve), etc. Y con una baja en A y una fila
-- activa en B, el `LIMIT 1` elegía cualquiera de las dos. Con el índice
-- parcial `vet_professionals_una_institucion_activa` (058) hay a lo sumo una
-- fila activa, así que el resultado queda determinado. Dependientes revisados
-- (pg_proc/pg_policies sobre la base local): is_my_patient,
-- owner_of_my_patient, erp.my_institution_id (y por ella todo el ERP),
-- current_vet_signature_id, register_vet_signature,
-- enforce_certificate_requires_signature, protect_vaccination_verification,
-- y las políticas de visits, vaccine_presets, medical_records, vaccinations,
-- dewormings, vet_signatures (tabla y storage), campaign_qr_sessions y
-- waiting_room_qr_sessions. Ninguno quiere a alguien dado de baja.
--
-- AUTO-VALIDACIÓN DE LA INSTITUCIÓN
--
-- `admin_set_vet_license(…, p_validated = true)` sobre el profesional TITULAR
-- activo (`role_in_institution = 'owner'`) marca además su institución
-- `validated = true, validated_at = now()` en la misma transacción. La
-- auditoría existente se conserva y el detalle dice si validó la institución.
-- El trigger `protect_institution_privileges` (069) la deja pasar sin cambios:
-- la función es `SECURITY DEFINER` con dueño `postgres`, y adentro
-- `current_user` es `postgres`, que está en su lista de exentos.
--
-- Rechazar o revocar la matrícula NO desvalida la institución, a propósito:
-- desvalidar le corta de golpe a toda la clínica —equipo incluido— el acceso
-- a pacientes que ya atendía como validada, y la matrícula de una persona no
-- es lo mismo que la habilitación del establecimiento. Si hay que quitarla, es
-- una decisión explícita del equipo de PetCloud con service role.
--
-- BACKFILL
--
-- Instituciones cuyo titular activo ya tiene `license_validated = true` pasan
-- a `validated = true`: es lo que habría hecho la función si hubiera existido.
--
-- DE PASO: `validated` TAMPOCO SE ELIGE AL CREAR
--
-- La 069 protegió `validated` en el UPDATE, pero `Authenticated users can
-- create vet institutions` (001) es `WITH CHECK (true)` y el trigger era solo
-- `BEFORE UPDATE`: cualquier sesión podía insertar una institución ya
-- validada. Ahora que `validated` abre datos clínicos, el mismo trigger corre
-- también en INSERT y fuerza `validated = false, validated_at = NULL` para
-- todo el que no sea service role / postgres / supabase_admin.
--
-- Cuerpos reemplazados: my_vet_institution_id() y my_vet_professional_id()
-- (001), admin_set_vet_license (060), protect_institution_privileges (069) y
-- las políticas listadas abajo (008, 010, 012, 041, 076). El ROLLBACK al pie
-- los restaura.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Resolución de la institución y del profesional: solo la fila activa
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION my_vet_institution_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT institution_id FROM vet_professionals
  WHERE profile_id = auth.uid()
    AND removed_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION my_vet_professional_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM vet_professionals
  WHERE profile_id = auth.uid()
    AND removed_at IS NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION my_vet_institution_id() IS
  'Institución de la fila activa (removed_at IS NULL) de quien llama. '
  'Desde la 080 la baja blanda cuenta.';
COMMENT ON FUNCTION my_vet_professional_id() IS
  'Ficha activa (removed_at IS NULL) de quien llama. Desde la 080 la baja '
  'blanda cuenta.';

-- ----------------------------------------------------------------------------
-- 2. Helper: ¿la institución activa de quien llama está validada?
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION my_institution_is_validated()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vet_professionals vp
    JOIN vet_institutions vi ON vi.id = vp.institution_id
    WHERE vp.profile_id = auth.uid()
      AND vp.removed_at IS NULL
      AND vi.validated
  );
$$;

COMMENT ON FUNCTION my_institution_is_validated() IS
  'true si quien llama tiene una fila activa en vet_professionals y su '
  'institución está validada. Implica is_vet(). 080.';

-- `anon` también: las políticas que la llaman son TO public (008), y una
-- política que invoca una función sin EXECUTE no filtra, revienta la consulta
-- entera con "permission denied for function". Para `anon` devuelve false
-- (auth.uid() es NULL), así que el permiso no expone nada.
REVOKE ALL ON FUNCTION my_institution_is_validated() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_institution_is_validated() TO authenticated, anon;

-- Los pacientes de mi institución activa, como conjunto: lo mismo que
-- `is_my_patient()` pero para las políticas de LECTURA. `pet_id IN (SELECT
-- my_patient_pet_ids())` se planifica como un SubPlan hasheado que se arma una
-- sola vez por consulta; `is_my_patient(pet_id)` corre dos subconsultas por
-- cada fila recorrida, y en un listado o una búsqueda por nombre eso es la
-- tabla entera (medido: 50.000 mascotas, 8,6 s contra el statement_timeout).
-- Las escrituras siguen con `is_my_patient`: evalúan una sola fila.
CREATE OR REPLACE FUNCTION my_patient_pet_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.pet_id FROM visits v
  WHERE v.institution_id = (SELECT my_vet_institution_id())
  UNION
  SELECT m.pet_id FROM medical_records m
  WHERE m.institution_id = (SELECT my_vet_institution_id());
$$;

COMMENT ON FUNCTION my_patient_pet_ids() IS
  'pet_id con visita o registro clínico en la institución activa de quien '
  'llama. Versión en conjunto de is_my_patient() para políticas de lectura. 080.';

REVOKE ALL ON FUNCTION my_patient_pet_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_patient_pet_ids() TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3. Lecturas clínicas: validada, o paciente propio
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "pets_select_vet" ON pets;
CREATE POLICY "pets_select_vet" ON pets FOR SELECT
  USING ((SELECT my_institution_is_validated()) OR id IN (SELECT my_patient_pet_ids()));

DROP POLICY IF EXISTS "medical_records_select_vet" ON medical_records;
CREATE POLICY "medical_records_select_vet" ON medical_records FOR SELECT
  USING ((SELECT my_institution_is_validated()) OR pet_id IN (SELECT my_patient_pet_ids()));

DROP POLICY IF EXISTS "vaccinations_select_vet" ON vaccinations;
CREATE POLICY "vaccinations_select_vet" ON vaccinations FOR SELECT
  USING ((SELECT my_institution_is_validated()) OR pet_id IN (SELECT my_patient_pet_ids()));

DROP POLICY IF EXISTS "dewormings_select_vet" ON dewormings;
CREATE POLICY "dewormings_select_vet" ON dewormings FOR SELECT
  USING ((SELECT my_institution_is_validated()) OR pet_id IN (SELECT my_patient_pet_ids()));

DROP POLICY IF EXISTS "medications_select_vet" ON medications;
CREATE POLICY "medications_select_vet" ON medications FOR SELECT
  USING ((SELECT my_institution_is_validated()) OR pet_id IN (SELECT my_patient_pet_ids()));

DROP POLICY IF EXISTS "conditions_select_vet" ON conditions;
CREATE POLICY "conditions_select_vet" ON conditions FOR SELECT
  USING ((SELECT my_institution_is_validated()) OR pet_id IN (SELECT my_patient_pet_ids()));

DROP POLICY IF EXISTS "weight_records_select_vet" ON weight_records;
CREATE POLICY "weight_records_select_vet" ON weight_records FOR SELECT
  USING ((SELECT my_institution_is_validated()) OR pet_id IN (SELECT my_patient_pet_ids()));

DROP POLICY IF EXISTS "pet_documents_select_vet" ON pet_documents;
CREATE POLICY "pet_documents_select_vet" ON pet_documents FOR SELECT
  USING ((SELECT my_institution_is_validated()) OR pet_id IN (SELECT my_patient_pet_ids()));

-- Storage de estudios (010): lectura, subida y borrado con la misma regla. El
-- dueño sigue leyendo por `has_pet_access`, que no cambia.
DROP POLICY IF EXISTS "medical_studies_select" ON storage.objects;
CREATE POLICY "medical_studies_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'medical-studies'
    AND (
      has_pet_access(storage_pet_id(name))
      OR (SELECT my_institution_is_validated())
      OR storage_pet_id(name) IN (SELECT my_patient_pet_ids())
    )
  );

DROP POLICY IF EXISTS "medical_studies_insert" ON storage.objects;
CREATE POLICY "medical_studies_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'medical-studies'
    AND (
      (SELECT my_institution_is_validated())
      OR storage_pet_id(name) IN (SELECT my_patient_pet_ids())
    )
  );

DROP POLICY IF EXISTS "medical_studies_delete" ON storage.objects;
CREATE POLICY "medical_studies_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'medical-studies'
    AND (
      (SELECT my_institution_is_validated())
      OR storage_pet_id(name) IN (SELECT my_patient_pet_ids())
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Escrituras que crean o mueven una relación con la mascota
--
-- En los UPDATE la regla va en el WITH CHECK: con el `pet_id` sin cambiar, la
-- fila vieja (visita o registro propio) ya hace verdadero `is_my_patient`,
-- porque la función ve el snapshot del inicio de la sentencia. Con un
-- `pet_id` ajeno, no.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "visits_insert" ON visits;
CREATE POLICY "visits_insert" ON visits FOR INSERT
  WITH CHECK (
    institution_id = (SELECT my_vet_institution_id())
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

DROP POLICY IF EXISTS "visits_update" ON visits;
CREATE POLICY "visits_update" ON visits FOR UPDATE
  USING (institution_id = (SELECT my_vet_institution_id()))
  WITH CHECK (
    institution_id = (SELECT my_vet_institution_id())
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

DROP POLICY IF EXISTS "medical_records_insert_vet" ON medical_records;
CREATE POLICY "medical_records_insert_vet" ON medical_records FOR INSERT
  WITH CHECK (
    vet_professional_id = (SELECT my_vet_professional_id())
    AND institution_id = (SELECT my_vet_institution_id())
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

DROP POLICY IF EXISTS "medical_records_update_vet" ON medical_records;
CREATE POLICY "medical_records_update_vet" ON medical_records FOR UPDATE
  USING (vet_professional_id = (SELECT my_vet_professional_id()))
  WITH CHECK (
    vet_professional_id = (SELECT my_vet_professional_id())
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

DROP POLICY IF EXISTS "appointments_insert" ON appointments;
CREATE POLICY "appointments_insert" ON appointments FOR INSERT
  WITH CHECK (
    is_institution_member(institution_id)
    AND institution_has_premium(institution_id)
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

DROP POLICY IF EXISTS "appointments_update" ON appointments;
CREATE POLICY "appointments_update" ON appointments FOR UPDATE
  USING (is_institution_member(institution_id) AND institution_has_premium(institution_id))
  WITH CHECK (
    is_institution_member(institution_id)
    AND institution_has_premium(institution_id)
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

DROP POLICY IF EXISTS "vaccinations_insert_vet" ON vaccinations;
CREATE POLICY "vaccinations_insert_vet" ON vaccinations FOR INSERT
  WITH CHECK (
    applied_by_id = (SELECT my_vet_professional_id())
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

DROP POLICY IF EXISTS "vaccinations_update_vet" ON vaccinations;
CREATE POLICY "vaccinations_update_vet" ON vaccinations FOR UPDATE
  USING (applied_by_id = (SELECT my_vet_professional_id()))
  WITH CHECK (
    applied_by_id = (SELECT my_vet_professional_id())
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

DROP POLICY IF EXISTS "dewormings_insert_vet" ON dewormings;
CREATE POLICY "dewormings_insert_vet" ON dewormings FOR INSERT
  WITH CHECK (
    applied_by_id = (SELECT my_vet_professional_id())
    AND ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
  );

-- 076: verificar una dosis cargada por el dueño, con la misma regla que leerla.
-- El trigger `protect_vaccination_verification` sigue acotando qué cambia.
DROP POLICY IF EXISTS "vaccinations_update_vet_verify_owner_loaded" ON vaccinations;
CREATE POLICY "vaccinations_update_vet_verify_owner_loaded" ON vaccinations
  FOR UPDATE
  USING (
    ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
    AND applied_by_id IS NULL
    AND declaration_session_id IS NULL
    AND NOT verified
  )
  WITH CHECK (
    ((SELECT my_institution_is_validated()) OR is_my_patient(pet_id))
    AND applied_by_id IS NULL
    AND declaration_session_id IS NULL
  );

-- ----------------------------------------------------------------------------
-- 5. `validated` no se elige al crear la institución
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION protect_institution_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- 080: al crear, la institución nace sin validar para todo el resto.
  IF TG_OP = 'INSERT' THEN
    NEW.validated := false;
    NEW.validated_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.validated IS DISTINCT FROM OLD.validated THEN
    NEW.validated := OLD.validated;
  END IF;

  IF NEW.validated_at IS DISTINCT FROM OLD.validated_at THEN
    NEW.validated_at := OLD.validated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vet_institutions_protect_privileges ON vet_institutions;
CREATE TRIGGER vet_institutions_protect_privileges
  BEFORE INSERT OR UPDATE ON vet_institutions
  FOR EACH ROW EXECUTE FUNCTION protect_institution_privileges();

-- ----------------------------------------------------------------------------
-- 6. Aprobar la matrícula del titular valida la institución
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_set_vet_license(
  p_professional_id UUID,
  p_validated BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE (professional_id UUID, validated BOOLEAN, reviewed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nota TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_etiqueta TEXT;
  v_reviewed_at TIMESTAMPTZ := now();
  v_existe BOOLEAN;
  v_institucion UUID;
  v_es_titular BOOLEAN;
  v_institucion_validada BOOLEAN := FALSE;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador de plataforma puede resolver matrículas'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT TRUE,
         COALESCE(NULLIF(btrim(p.first_name || ' ' || p.last_name), ''), u.email)
           || ' · ' || vp.license_number,
         vp.institution_id,
         vp.role_in_institution = 'owner' AND vp.removed_at IS NULL
    INTO v_existe, v_etiqueta, v_institucion, v_es_titular
  FROM vet_professionals vp
  JOIN profiles p ON p.id = vp.profile_id
  JOIN auth.users u ON u.id = vp.profile_id
  WHERE vp.id = p_professional_id;

  IF NOT COALESCE(v_existe, FALSE) THEN
    RAISE EXCEPTION 'El profesional % no existe', p_professional_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE vet_professionals
  SET license_validated = p_validated,
      license_reviewed_at = v_reviewed_at,
      -- Desvalidar y dejar la guardia anunciada seria anunciar como guardia a
      -- alguien sin matricula. El trigger lo cubre; esta funcion esta exenta.
      on_call = CASE WHEN p_validated THEN on_call ELSE FALSE END
  WHERE id = p_professional_id;

  -- 080: la matrícula del titular activo habilita a su institución. Solo en
  -- la aprobación; rechazar no desvalida (ver encabezado). `validated_at` no
  -- se pisa si ya estaba validada.
  IF p_validated AND COALESCE(v_es_titular, FALSE) THEN
    UPDATE vet_institutions vi
    SET validated = true,
        validated_at = v_reviewed_at
    WHERE vi.id = v_institucion
      AND NOT vi.validated;

    v_institucion_validada := FOUND;
  END IF;

  INSERT INTO vet_license_reviews (
    professional_id, reviewer_profile_id, validated, note, occurred_at
  ) VALUES (
    p_professional_id, auth.uid(), p_validated, v_nota, v_reviewed_at
  );

  PERFORM log_admin_action(
    CASE WHEN p_validated THEN 'vet_license_validated' ELSE 'vet_license_rejected' END,
    'vet_professional',
    p_professional_id,
    v_etiqueta,
    jsonb_build_object(
      'con_nota', v_nota IS NOT NULL,
      'institucion_validada', v_institucion_validada
    )
  );

  RETURN QUERY SELECT p_professional_id, p_validated, v_reviewed_at;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Backfill: titular activo con matrícula validada → institución validada
-- ----------------------------------------------------------------------------

UPDATE vet_institutions vi
SET validated = true,
    validated_at = COALESCE(vp.license_reviewed_at, now())
FROM vet_professionals vp
WHERE vp.institution_id = vi.id
  AND vp.role_in_institution = 'owner'
  AND vp.removed_at IS NULL
  AND vp.license_validated
  AND NOT vi.validated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- El backfill no se deshace solo: las instituciones que validó quedan
-- validadas (es el estado que habría dejado la función). Si hiciera falta, se
-- revierte a mano mirando `admin_action_log`/`vet_license_reviews`.
--
-- DROP POLICY "pets_select_vet" ON pets;
-- CREATE POLICY "pets_select_vet" ON pets FOR SELECT USING (is_vet());
-- -- Idem medical_records, vaccinations, dewormings, medications, conditions,
-- -- weight_records y pet_documents: `*_select_vet` FOR SELECT USING (is_vet()).
--
-- DROP POLICY "medical_studies_select" ON storage.objects;
-- CREATE POLICY "medical_studies_select" ON storage.objects FOR SELECT
--   TO authenticated USING (bucket_id = 'medical-studies'
--     AND (has_pet_access(storage_pet_id(name)) OR is_vet()));
-- DROP POLICY "medical_studies_insert" ON storage.objects;
-- CREATE POLICY "medical_studies_insert" ON storage.objects FOR INSERT
--   TO authenticated WITH CHECK (bucket_id = 'medical-studies' AND is_vet());
-- DROP POLICY "medical_studies_delete" ON storage.objects;
-- CREATE POLICY "medical_studies_delete" ON storage.objects FOR DELETE
--   TO authenticated USING (bucket_id = 'medical-studies' AND is_vet());
--
-- DROP POLICY "visits_insert" ON visits;
-- CREATE POLICY "visits_insert" ON visits FOR INSERT
--   WITH CHECK (institution_id = my_vet_institution_id());
-- DROP POLICY "visits_update" ON visits;
-- CREATE POLICY "visits_update" ON visits FOR UPDATE
--   USING (institution_id = my_vet_institution_id())
--   WITH CHECK (institution_id = my_vet_institution_id());
-- DROP POLICY "medical_records_insert_vet" ON medical_records;
-- CREATE POLICY "medical_records_insert_vet" ON medical_records FOR INSERT
--   WITH CHECK (vet_professional_id = my_vet_professional_id()
--     AND institution_id = my_vet_institution_id());
-- DROP POLICY "medical_records_update_vet" ON medical_records;
-- CREATE POLICY "medical_records_update_vet" ON medical_records FOR UPDATE
--   USING (vet_professional_id = my_vet_professional_id())
--   WITH CHECK (vet_professional_id = my_vet_professional_id());
-- DROP POLICY "appointments_insert" ON appointments;
-- CREATE POLICY "appointments_insert" ON appointments FOR INSERT
--   WITH CHECK (is_institution_member(institution_id)
--     AND institution_has_premium(institution_id));
-- DROP POLICY "appointments_update" ON appointments;
-- CREATE POLICY "appointments_update" ON appointments FOR UPDATE
--   USING (is_institution_member(institution_id) AND institution_has_premium(institution_id))
--   WITH CHECK (is_institution_member(institution_id) AND institution_has_premium(institution_id));
-- DROP POLICY "vaccinations_insert_vet" ON vaccinations;
-- CREATE POLICY "vaccinations_insert_vet" ON vaccinations FOR INSERT
--   WITH CHECK (applied_by_id = my_vet_professional_id());
-- DROP POLICY "vaccinations_update_vet" ON vaccinations;
-- CREATE POLICY "vaccinations_update_vet" ON vaccinations FOR UPDATE
--   USING (applied_by_id = my_vet_professional_id())
--   WITH CHECK (applied_by_id = my_vet_professional_id());
-- DROP POLICY "dewormings_insert_vet" ON dewormings;
-- CREATE POLICY "dewormings_insert_vet" ON dewormings FOR INSERT
--   WITH CHECK (applied_by_id = my_vet_professional_id());
-- DROP POLICY "vaccinations_update_vet_verify_owner_loaded" ON vaccinations;
-- CREATE POLICY "vaccinations_update_vet_verify_owner_loaded" ON vaccinations
--   FOR UPDATE
--   USING (is_vet() AND applied_by_id IS NULL AND declaration_session_id IS NULL
--     AND NOT verified)
--   WITH CHECK (is_vet() AND applied_by_id IS NULL AND declaration_session_id IS NULL);
--
-- DROP TRIGGER vet_institutions_protect_privileges ON vet_institutions;
-- CREATE TRIGGER vet_institutions_protect_privileges BEFORE UPDATE ON vet_institutions
--   FOR EACH ROW EXECUTE FUNCTION protect_institution_privileges();
-- -- y el cuerpo de protect_institution_privileges de la 069, sin la rama INSERT.
--
-- -- admin_set_vet_license: el cuerpo de la 060, tal cual (sin el bloque 080).
--
-- CREATE OR REPLACE FUNCTION my_vet_institution_id() RETURNS UUID LANGUAGE sql
--   STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT institution_id FROM vet_professionals WHERE profile_id = auth.uid() LIMIT 1;
-- $$;
-- CREATE OR REPLACE FUNCTION my_vet_professional_id() RETURNS UUID LANGUAGE sql
--   STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT id FROM vet_professionals WHERE profile_id = auth.uid() LIMIT 1;
-- $$;
--
-- DROP FUNCTION my_patient_pet_ids();
-- DROP FUNCTION my_institution_is_validated();
