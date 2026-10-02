-- ============================================================================
-- PetCloud — Migración 064: la firma se congela sobre lo que firma
--
-- POR QUÉ EXISTE
--
-- La 063 dejó el sustrato: la tabla `vet_signatures`, el predicado
-- `current_vet_signature_id()` y tres punteros `signature_id` anulables en
-- `medical_records`, `vaccinations` y `pet_documents`. Nadie los escribe. Un
-- puntero que nadie llena es una columna, no un congelamiento.
--
-- Esta migración los llena. Cuando alguien firma —una consulta, una vacunación
-- que aplicó, un certificado que emite— y tiene firma vigente, el puntero queda
-- estampado con ESA fila. Después no se mueve: cambiar de firma más adelante no
-- reescribe hacia atrás lo ya firmado, que es la razón entera por la que la
-- firma vive en una tabla con historial en vez de en una columna del
-- profesional.
--
-- LA 064 NO RECHAZA NADA POR FALTA DE FIRMA, A PROPÓSITO
--
-- Es oportunista: si hay firma vigente se estampa, y si no hay, se firma igual
-- que hasta hoy y la fila queda con `signature_id` NULL. El portón —negarse a
-- firmar sin firma cargada— es la 065, y llega cuando los profesionales ya
-- tuvieron tiempo de cargar la suya. Si el rechazo viajara acá, el día que se
-- aplica nadie tiene firma y la clínica entera deja de poder firmar.
--
-- CUERPOS REEMPLAZADOS, ANOTADOS PARA PODER VOLVER
--
--   · `enforce_signature_requires_license()` — cuerpo de la 009.
--   · `protect_vaccination_verification()`   — cuerpo de la 043.
--
-- Los dos están transcriptos literales en el plan de reversión al pie, tal como
-- los devuelve hoy `pg_get_functiondef()`. Revertir es pegar esos dos bloques.
--
-- NINGUNA DE LAS DOS GANA `SECURITY DEFINER`, Y ESO ES LA 009 ENTERA
--
-- La 009 existió porque la guarda nació `SECURITY DEFINER`: adentro,
-- `current_user` era la dueña de la función y la exención de rol acertaba en
-- todas las llamadas, así que la guarda no guardaba nada. Acá `current_user`
-- tiene que seguir siendo quien escribe de verdad. La exención
-- `('service_role', 'postgres', 'supabase_admin')` de las dos funciones está
-- copiada literal de la definición que hay hoy en la base, no reescrita de
-- memoria.
--
-- `current_vet_signature_id()` tampoco es definer (063): corre bajo la RLS de
-- quien llama, así que nunca devuelve la firma de otro. Por eso el puntero se
-- resuelve desde la sesión y nunca desde `NEW.vet_professional_id`: nadie puede
-- estampar la firma ajena poniendo el id ajeno en la fila.
--
-- LO QUE SE ENCONTRÓ EN LA BASE Y CORRIGE AL DISEÑO
--
-- El diseño dice que el certificado no tiene ninguna guarda en la base y que
-- solo lo frena `vet.licenciaValidada` en la Server Action. Es falso: la
-- política `pet_documents_insert_vet` (016) ya exige
-- `type <> 'certificate' OR is_validated_vet()`. La matrícula ya está pedida
-- donde corresponde, así que el trigger de abajo NO vuelve a pedirla: solo
-- estampa.
--
-- El trigger del certificado sí cubre `UPDATE`, que el diseño no contemplaba:
-- `pet_documents_update` deja modificar la fila a cualquiera con permiso de
-- edición sobre la mascota —el dueño incluido—, así que sin esa rama el puntero
-- se podría mover después de emitido y el congelamiento sería decorativo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · La consulta: el cuerpo de la 009 más dos trabajos
--
-- Lo agregado es (a) el puntero no se mueve una vez firmado y (b) al firmar, si
-- hay firma vigente, se estampa. Lo demás está igual, incluidas la exención de
-- rol y la condición de matrícula validada.
--
-- El `IF NOT is_validated_vet()` queda anidado en vez de colgado del mismo
-- `AND`: la condición que se evalúa es idéntica, y así el bloque de la firma
-- vive bajo exactamente las mismas guardas que el rechazo por matrícula, sin
-- repetirlas.
--
-- Por qué ningún camino de escritura en `src/` cambia: el puntero lo pone el
-- trigger. `signConsultation` firma con un UPDATE horas después del INSERT, y
-- un `BEFORE INSERT OR UPDATE` cubre las dos transiciones. Si cada Server
-- Action tuviera que acordarse, la que se olvide manda un registro "firmado"
-- sin firma.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_signature_requires_license()
RETURNS TRIGGER AS $$
DECLARE
  v_current UUID;
BEGIN
  -- Una vez firmado, el puntero no se mueve: en eso consiste congelar.
  IF TG_OP = 'UPDATE' AND OLD.signature_id IS NOT NULL
     AND NEW.signature_id IS DISTINCT FROM OLD.signature_id
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
  THEN
    RAISE EXCEPTION 'La firma de un registro ya firmado no se cambia.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.is_signed
     AND (TG_OP = 'INSERT' OR NOT OLD.is_signed)
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
  THEN
    IF NOT is_validated_vet() THEN
      RAISE EXCEPTION 'Solo un profesional con matrícula validada puede firmar un registro clínico.';
    END IF;

    v_current := current_vet_signature_id();

    IF NEW.signature_id IS NULL THEN
      -- Sin firma vigente esto deja NULL, y se firma igual: la 064 no exige
      -- nada todavía. El rechazo entra en la 065, acá mismo.
      NEW.signature_id := v_current;
    ELSIF NEW.signature_id IS DISTINCT FROM v_current THEN
      -- Quien firma, firma con la suya. La FK solo pide que la firma exista;
      -- sin esto, conocer un UUID ajeno alcanzaría para estamparlo.
      RAISE EXCEPTION 'Un registro se firma con la firma vigente de quien lo firma.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF NEW.is_signed THEN
    NEW.is_draft := FALSE;
    NEW.signed_at := COALESCE(NEW.signed_at, now());
  END IF;

  RETURN NEW;
END;
-- Sin SECURITY DEFINER: acá `current_user` tiene que ser quien escribe de
-- verdad, que es lo que distingue a `authenticated` de `service_role`.
$$ LANGUAGE plpgsql SET search_path = public;

-- ----------------------------------------------------------------------------
-- 2 · La vacunación: el cuerpo de la 043, intacto, con el mismo bloque adentro
--
-- Se restata completo porque no hay forma de agregarle nada a un cuerpo de
-- plpgsql sin volver a escribirlo. Todo lo que había sigue palabra por palabra:
-- la exención de rol que corta arriba de todo, la validación del QR de campaña,
-- el blanqueo de `verified` para quien no es profesional, la prohibición de
-- reasignar sesión o campaña, el camino de revisión por institución y el
-- candado sobre la verificación propia.
--
-- Lo agregado son tres cosas y ninguna toca las anteriores:
--
--   (a) El puntero no se mueve una vez estampado.
--   (b) Al insertar una vacunación verificada de la mano de un profesional, se
--       estampa su firma vigente si la tiene.
--   (c) Lo mismo cuando el profesional que la aplicó pasa su propia fila a
--       verificada.
--
-- POR QUÉ NO EN EL CAMINO DE REVISIÓN DE CAMPAÑA, que es el tercer `RETURN NEW`
-- donde `verified` puede quedar en true: esa fila la declaró un dueño en una
-- campaña y su `applied_by_id` sigue en NULL. Quien revisa no aplicó la dosis;
-- queda registrado en `reviewed_by_id`, que es lo que hizo. Estampar ahí su
-- firma sería firmar un acto ajeno. El diseño habla de "los dos caminos en los
-- que `verified` queda en true de la mano de un profesional" y estos son.
--
-- NO GANA `SET search_path`: el cuerpo de la 043 no lo tiene y esta migración
-- no es el lugar para cambiarle la superficie de seguridad a una función que
-- solo viene a extenderse. Queda anotado como deuda, aparte.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_vaccination_verification()
RETURNS TRIGGER AS $$
DECLARE
  v_current UUID;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.declaration_session_id IS NOT NULL
       AND NOT campaign_qr_session_is_live(NEW.declaration_session_id, NEW.campaign_id)
    THEN
      RAISE EXCEPTION
        'El código QR de campaña no es válido, ya venció, fue revocado o la campaña ya cerró.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF my_vet_professional_id() IS NULL THEN
      IF NEW.campaign_id IS NOT NULL AND NEW.declaration_session_id IS NULL THEN
        RAISE EXCEPTION
          'No se puede declarar una dosis de campaña sin un código QR vigente.'
          USING ERRCODE = 'restrict_violation';
      END IF;

      NEW.verified := FALSE;
      NEW.applied_by_id := NULL;
      NEW.review_status := CASE
        WHEN NEW.declaration_session_id IS NOT NULL THEN 'pending'
        ELSE 'not_applicable'
      END;
    END IF;

    -- 064 (b): acá `NEW.verified` ya es definitivo para el INSERT.
    IF NEW.verified AND my_vet_professional_id() IS NOT NULL THEN
      v_current := current_vet_signature_id();

      IF NEW.signature_id IS NULL THEN
        NEW.signature_id := v_current;
      ELSIF NEW.signature_id IS DISTINCT FROM v_current THEN
        RAISE EXCEPTION 'Una vacunación se firma con la firma vigente de quien la firma.'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' a partir de acá.

  -- 064 (a): una vez estampado, el puntero no se mueve.
  IF OLD.signature_id IS NOT NULL
     AND NEW.signature_id IS DISTINCT FROM OLD.signature_id
  THEN
    RAISE EXCEPTION 'La firma de una vacunación ya firmada no se cambia.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Reasignar a qué sesión o campaña pertenece una fila ya escrita no es una
  -- revisión, es mover la fila a otro lado.
  IF NEW.declaration_session_id IS DISTINCT FROM OLD.declaration_session_id
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
  THEN
    RAISE EXCEPTION
      'No se puede reasignar la sesión ni la campaña de una vacunación ya registrada.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.declaration_session_id IS NOT NULL THEN
    -- Camino de revisión: solo un miembro de la institución que emitió el QR.
    IF NOT is_institution_member(qr_session_institution_id(OLD.declaration_session_id)) THEN
      NEW.verified := OLD.verified;
      NEW.review_status := OLD.review_status;
      NEW.reviewed_by_id := OLD.reviewed_by_id;
      NEW.reviewed_at := OLD.reviewed_at;
      NEW.rejection_reason := OLD.rejection_reason;
      RETURN NEW;
    END IF;

    IF NEW.review_status IS DISTINCT FROM OLD.review_status
       AND (OLD.review_status, NEW.review_status)
           NOT IN (('pending', 'verified'), ('pending', 'rejected'))
    THEN
      RAISE EXCEPTION
        'Una declaración de campaña solo puede pasar de "pending" a "verified" o "rejected".'
        USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
  END IF;

  -- Fila sin sesión de campaña: solo el veterinario que la aplicó puede tocar
  -- su propia verificación (008 ya se lo permite vía RLS). Nadie más —ni el
  -- dueño con acceso de edición— mueve estas columnas.
  IF OLD.applied_by_id IS NULL OR OLD.applied_by_id IS DISTINCT FROM my_vet_professional_id() THEN
    NEW.verified := OLD.verified;
    NEW.review_status := OLD.review_status;
    NEW.reviewed_by_id := OLD.reviewed_by_id;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  -- 064 (c): recién acá `NEW.verified` es definitivo para este camino.
  IF NEW.verified AND NOT OLD.verified AND my_vet_professional_id() IS NOT NULL THEN
    v_current := current_vet_signature_id();

    IF NEW.signature_id IS NULL THEN
      NEW.signature_id := v_current;
    ELSIF NEW.signature_id IS DISTINCT FROM v_current THEN
      RAISE EXCEPTION 'Una vacunación se firma con la firma vigente de quien la firma.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3 · El certificado: se emite como PDF a `pet_documents`, no como registro
--
-- La matrícula ya la exige `pet_documents_insert_vet` (016) para
-- `type = 'certificate'`, así que acá no se vuelve a pedir: se estampa y nada
-- más.
--
-- Acotado a `my_vet_professional_id() IS NOT NULL` por la razón del diseño: un
-- dueño que sube el certificado de papel de su mascota no firma nada, y su fila
-- queda con `signature_id` NULL, que es la verdad.
--
-- OJO, Y QUEDA DICHO EN VEZ DE ESCONDIDO: esa condición no distingue a quien
-- emite un certificado de un profesional que sube el certificado de papel de su
-- propia mascota. Hoy el costo es un puntero de más en una fila; cuando la 065
-- convierta esto en un rechazo, el costo pasa a ser negarle la subida a esa
-- persona. Hay que resolverlo antes de la 065, no después.
--
-- La rama de UPDATE no está en el diseño y está acá porque
-- `pet_documents_update` deja modificar la fila a cualquiera con permiso de
-- edición sobre la mascota. Sin ella, el puntero se mueve después de emitido.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_certificate_requires_signature()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.signature_id IS NOT NULL
       AND NEW.signature_id IS DISTINCT FROM OLD.signature_id
    THEN
      RAISE EXCEPTION 'La firma de un documento ya firmado no se cambia.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.type = 'certificate'
     AND NEW.signature_id IS NULL
     AND my_vet_professional_id() IS NOT NULL
  THEN
    NEW.signature_id := current_vet_signature_id();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER pet_documents_certificate_signature
  BEFORE INSERT OR UPDATE ON pet_documents
  FOR EACH ROW EXECUTE FUNCTION enforce_certificate_requires_signature();

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS pet_documents_certificate_signature ON pet_documents;
-- DROP FUNCTION IF EXISTS enforce_certificate_requires_signature();
--
-- -- El cuerpo de la 009, tal cual estaba antes de esta migración:
-- CREATE OR REPLACE FUNCTION enforce_signature_requires_license()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF NEW.is_signed
--      AND (TG_OP = 'INSERT' OR NOT OLD.is_signed)
--      AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
--      AND NOT is_validated_vet()
--   THEN
--     RAISE EXCEPTION 'Solo un profesional con matrícula validada puede firmar un registro clínico.';
--   END IF;
--
--   IF NEW.is_signed THEN
--     NEW.is_draft := FALSE;
--     NEW.signed_at := COALESCE(NEW.signed_at, now());
--   END IF;
--
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SET search_path = public;
--
-- -- El cuerpo de la 043, tal cual estaba antes de esta migración: es el de
-- -- arriba sin el `DECLARE v_current UUID;` y sin los tres bloques marcados
-- -- `064 (a)`, `064 (b)` y `064 (c)`. Todo lo demás queda igual.
--
-- Volver atrás deja los `signature_id` ya estampados donde están: son punteros
-- válidos a filas que siguen existiendo, y la 063 no los exige. Lo que se
-- pierde es que los nuevos se llenen. Antes de cualquier despliegue, revertir
-- es sencillamente no aplicarla.
