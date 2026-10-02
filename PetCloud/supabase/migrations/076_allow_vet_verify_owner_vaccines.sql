-- ============================================================================
-- PetCloud — Migración 076: un profesional verifica una dosis cargada por el dueño
--
-- Hasta acá, una dosis cargada de memoria por el dueño (`applied_by_id IS
-- NULL`, sin `declaration_session_id`) no tenía ningún camino a `verified`:
-- la regla 7 de `protect_vaccination_verification()` (043) solo deja tocar las
-- columnas de verificación al profesional que aplicó la dosis, y en una carga
-- del dueño ese profesional no existe. Además ninguna política de UPDATE le
-- alcanzaba la fila a un veterinario: `vaccinations_update` (002) pide acceso
-- de edición a la mascota, `vaccinations_update_vet` (008) pide haberla
-- aplicado y `vaccinations_update_campaign_review` (043) pide una sesión de QR.
--
-- DOS PIEZAS, Y POR QUÉ NO UNA RPC `SECURITY DEFINER`
--
-- Una función definer corre como su dueña (`postgres`), y el trigger exime a
-- `postgres` en su primera línea: se saltearía también el estampado de firma y
-- el portón de la 065, que son justamente lo que hace que una verificación
-- valga algo. Por eso el camino es el mismo que ya usan las otras tres
-- verificaciones —UPDATE con la sesión real de quien verifica—:
--
--  1. Una política de UPDATE **nueva** (no se toca ninguna existente) que deja
--     llegar a un profesional solo a filas cargadas por el dueño, sin sesión de
--     campaña y todavía sin verificar.
--  2. Una regla nueva en el trigger que, para quien entró por esa política,
--     acepta únicamente la transición `verified: false → true`, aborta si
--     cambia cualquier otra columna de la fila, y fija `review_status`,
--     `reviewed_by_id` y `reviewed_at` del lado de la base — nunca con los
--     valores que manda el cliente.
--
-- `reviewed_by_id` referencia `vet_professionals(id)` (043), no `profiles`: se
-- fuerza a `my_vet_professional_id()`, que es el profesional de `auth.uid()`.
--
-- ALCANCE, decisión aceptada: la política pide `is_vet()`, el mismo alcance
-- que ya tiene `pets_select_vet` (008) para leer la mascota. En la práctica el
-- portón de la 065 lo angosta: sin firma vigente —y sin matrícula validada no
-- hay firma— la verificación aborta. Recepción no verifica.
--
-- Quien además tiene acceso de edición a la mascota (un profesional que es
-- dueño o codueño) NO entra por la regla nueva: sigue en la regla 7 de
-- siempre y no puede verificar su propia carga. Autoverificarse es
-- exactamente lo que la 043 vino a cerrar.
--
-- CUERPO REEMPLAZADO, ANOTADO PARA PODER VOLVER: `protect_vaccination_verification()`
-- — cuerpo de la 065, entero, con un solo bloque agregado (marcado "076").
-- Revertir es volver a correr el `CREATE OR REPLACE` de la 065 y dropear la
-- política de abajo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · La política
--
-- `USING` exige `NOT verified`; el `WITH CHECK` no, porque la fila nueva sale
-- verificada. Los dos exigen que siga siendo una carga del dueño sin sesión:
-- sin eso, el UPDATE podría "mudar" la fila fuera del alcance de la política.
-- Qué columnas pueden cambiar lo decide el trigger, no esta política — mismo
-- reparto que la 043.
-- ----------------------------------------------------------------------------
CREATE POLICY "vaccinations_update_vet_verify_owner_loaded" ON vaccinations FOR UPDATE
  USING (
    is_vet()
    AND applied_by_id IS NULL
    AND declaration_session_id IS NULL
    AND NOT verified
  )
  WITH CHECK (
    is_vet()
    AND applied_by_id IS NULL
    AND declaration_session_id IS NULL
  );

-- ----------------------------------------------------------------------------
-- 2 · El trigger
--
-- Sigue sin `SECURITY DEFINER` y con el mismo `search_path` que le dejaron la
-- 043/064/065 (ninguno): el motivo está en el encabezado de la 043.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_vaccination_verification()
RETURNS TRIGGER AS $$
DECLARE
  v_current UUID;
  v_verificacion_del_dueno BOOLEAN := FALSE;
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

      -- 065: el portón.
      IF NEW.signature_id IS NULL THEN
        RAISE EXCEPTION 'Cargá tu firma en Ajustes antes de firmar una vacunación.'
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

  -- 076: dosis cargada por el dueño, verificada por un profesional que NO
  -- tiene acceso de edición a la mascota — o sea, que llegó a la fila por
  -- `vaccinations_update_vet_verify_owner_loaded` y no como dueño. Solo puede
  -- verificarla, y nada más de la fila cambia en ese UPDATE.
  IF OLD.applied_by_id IS NULL
     AND my_vet_professional_id() IS NOT NULL
     AND NOT has_pet_access(OLD.pet_id, 'edit')
  THEN
    IF NOT (NEW.verified AND NOT OLD.verified)
       OR (to_jsonb(NEW) - ARRAY['verified', 'review_status', 'reviewed_by_id',
                                 'reviewed_at', 'rejection_reason',
                                 'signature_id', 'updated_at'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['verified', 'review_status', 'reviewed_by_id',
                                 'reviewed_at', 'rejection_reason',
                                 'signature_id', 'updated_at'])
    THEN
      RAISE EXCEPTION
        'Sobre una dosis cargada por el dueño, un profesional solo puede verificarla.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- Lo que dice quién y cuándo revisó lo pone la base, no el cliente.
    NEW.review_status := 'verified';
    NEW.reviewed_by_id := my_vet_professional_id();
    NEW.reviewed_at := now();
    NEW.rejection_reason := OLD.rejection_reason;
    v_verificacion_del_dueno := TRUE;
  END IF;

  -- Fila sin sesión de campaña: solo el veterinario que la aplicó puede tocar
  -- su propia verificación (008 ya se lo permite vía RLS). Nadie más —ni el
  -- dueño con acceso de edición— mueve estas columnas. (076: salvo el caso de
  -- arriba, que ya validó la transición.)
  IF NOT v_verificacion_del_dueno
     AND (OLD.applied_by_id IS NULL OR OLD.applied_by_id IS DISTINCT FROM my_vet_professional_id())
  THEN
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

    -- 065: el portón.
    IF NEW.signature_id IS NULL THEN
      RAISE EXCEPTION 'Cargá tu firma en Ajustes antes de firmar una vacunación.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ROLLBACK
-- DROP POLICY IF EXISTS "vaccinations_update_vet_verify_owner_loaded" ON vaccinations;
-- Volver a correr el `CREATE OR REPLACE FUNCTION protect_vaccination_verification()`
-- de la 065 tal cual está en ese archivo.
