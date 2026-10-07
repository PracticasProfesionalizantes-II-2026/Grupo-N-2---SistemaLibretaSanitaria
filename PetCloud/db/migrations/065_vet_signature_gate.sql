-- ============================================================================
-- PetCloud — Migración 065: el portón. Sin firma cargada no se firma.
--
-- POR QUÉ EXISTE
--
-- La 063 creó el registro de firmas y la 064 empezó a estamparlo: cuando quien
-- firma tiene firma vigente, el puntero queda congelado sobre lo firmado. Las
-- dos son oportunistas a propósito —si no hay firma, se firma igual y la fila
-- queda con `signature_id` NULL—, porque el día que se aplican nadie tiene
-- todavía una firma cargada y una clínica entera sin poder firmar es peor que
-- un puntero vacío.
--
-- Esta migración cierra el circuito: a partir de acá, firmar sin firma vigente
-- se rechaza en la base. Es lo único que agrega. No hay tabla nueva, no hay
-- columna nueva, no hay política nueva; son tres cuerpos de trigger con una
-- condición más cada uno.
--
-- CUÁNDO SE APLICA, Y NO ES UN DETALLE DE DESPLIEGUE
--
-- Después de que la 063 y la 064 estén en producción y los profesionales hayan
-- tenido tiempo de cargar su firma en Ajustes. Aplicada antes, deja sin poder
-- firmar a todo el mundo. Ese orden es la razón entera por la que el cambio se
-- partió en tres migraciones en vez de una.
--
-- CUERPOS REEMPLAZADOS, ANOTADOS PARA PODER VOLVER
--
--   · `enforce_signature_requires_license()`     — cuerpo de la 064.
--   · `protect_vaccination_verification()`       — cuerpo de la 064.
--   · `enforce_certificate_requires_signature()` — cuerpo de la 064.
--
-- Los tres están leídos de `pg_get_functiondef()` sobre la base con la 064
-- aplicada, no transcriptos de memoria ni del documento de diseño: restatear un
-- cuerpo de memoria ya introdujo dos desajustes en la rebanada anterior. El
-- plan de reversión al pie dice exactamente qué sacar para volver a la 064.
--
-- NINGUNA DE LAS TRES GANA `SECURITY DEFINER`, Y ESO SIGUE SIENDO LA 009
--
-- La 009 existió porque la guarda nació `SECURITY DEFINER`: adentro,
-- `current_user` era la dueña de la función, así que la exención
-- `('service_role', 'postgres', 'supabase_admin')` acertaba en todas las
-- llamadas y la guarda no guardaba nada. Esa exención está copiada literal de
-- la definición viva, no reescrita. `prosecdef` tiene que seguir en `false`
-- para las tres, y hay un test de RLS que lo prueba por su efecto: un
-- profesional sin matrícula validada sigue sin poder firmar.
--
-- `protect_vaccination_verification()` sigue SIN `SET search_path`, como la 043
-- y la 064 la dejaron. Endurecerle la superficie de seguridad a una función en
-- la migración que solo viene a agregarle una condición mezcla dos cambios que
-- se revisan distinto. Queda como deuda anotada, aparte.
--
-- EL CERTIFICADO: A QUIÉN ALCANZA EL PORTÓN Y A QUIÉN NO
--
-- La 064 estampaba el certificado con la sola condición
-- `my_vet_professional_id() IS NOT NULL`, y dejó anotado que eso no distingue
-- dos cosas muy distintas: emitir un certificado para un paciente, y archivar
-- el certificado de papel de la propia mascota. Mientras era un estampado de
-- más el costo era una fila con un puntero que sobra. Convertido en rechazo, el
-- costo pasa a ser negarle la subida a esa persona.
--
-- `documents-actions.ts` mapea la opción "certificado" del panel del dueño a
-- `type = 'certificate'`, así que una veterinaria que tiene un perro sube el
-- certificado antirrábico de su perro, emitido en otra clínica, por el camino
-- de dueño. Con el portón colgado solo de "es profesional", esa subida se
-- rechaza. Una guarda cuya forma de esquivarla es mentirle a la aplicación
-- —archivarlo como `type = 'otro'`— compra una regla hoy y la paga para
-- siempre: el día que alguien cuente certificados, esas filas no están y nadie
-- se va a acordar por qué.
--
-- Resuelto por el maintainer el 2026-09-22: **el portón exime a quien está
-- actuando como dueño de la mascota.** Se activa solo cuando
-- `my_vet_professional_id() IS NOT NULL AND NOT has_pet_access(pet_id, 'edit')`.
-- `has_pet_access` es verdadera para el dueño y para quien tenga acceso
-- compartido de edición, así que separa limpio "emitir para un paciente" de
-- "archivar el papel de mi propia mascota".
--
-- EL AGUJERO QUE ESTO DEJA, DICHO Y NO ESCONDIDO: una veterinaria que atiende a
-- su propia mascota en su propia clínica queda exenta del portón, y su
-- certificado se emite sin firma. Es la dirección de error elegida a
-- conciencia. Ser demasiado permisivo cuesta un certificado sin firmar; ser
-- demasiado estricto deja a una persona real afuera del registro de su propia
-- mascota, y este proyecto no publica guardas que obliguen a mentir para
-- pasarlas.
--
-- La misma condición gobierna ahora el estampado, no solo el rechazo. Si solo
-- gobernara el rechazo, el certificado de papel que sube esa misma persona
-- seguiría saliendo estampado con su firma: una fila que afirma que ella firmó
-- un documento que emitió otra clínica. Era la deuda que la 064 anotó como "hay
-- que resolverlo antes de la 065"; se resuelve acá y de un solo lado.
--
-- LA VACUNACIÓN NO NECESITA ESA DISTINCIÓN, y conviene decir por qué
--
-- Ahí el discriminante no es quién es la persona sino `verified`, y todos los
-- caminos del dueño escriben `verified: false` —`health-records-actions.ts` y
-- `campaign-declaration-actions.ts`, y el propio trigger lo blanquea cuando
-- `my_vet_professional_id()` es NULL—. Una profesional que carga la vacuna de
-- su propia mascota por el panel del dueño entra con `verified` en false y el
-- portón ni se entera. El camino que sí lo cruza es el del panel profesional,
-- que es exactamente el acto que tiene que estar firmado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · La consulta
--
-- Cuerpo de la 064 con una sola condición nueva: si después de resolver la
-- firma vigente el puntero sigue en NULL, se rechaza. El orden importa y no es
-- casual: el `ELSIF` de "firma ajena" va antes, así que quien manda el id de
-- otra persona recibe ese mensaje y no este.
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
      NEW.signature_id := v_current;
    ELSIF NEW.signature_id IS DISTINCT FROM v_current THEN
      -- Quien firma, firma con la suya. La FK solo pide que la firma exista;
      -- sin esto, conocer un UUID ajeno alcanzaría para estamparlo.
      RAISE EXCEPTION 'Un registro se firma con la firma vigente de quien lo firma.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- 065: el portón. Hasta la 064 esto quedaba en NULL y se firmaba igual.
    -- Guardar el borrador sigue sin pasar por acá: solo llega quien pone
    -- `is_signed`, así que nadie pierde lo escrito por no tener firma.
    IF NEW.signature_id IS NULL THEN
      RAISE EXCEPTION 'Cargá tu firma en Ajustes antes de firmar un registro clínico.'
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
-- 2 · La vacunación
--
-- El cuerpo de la 064 entero —que a su vez es el de la 043 entero—, con el
-- rechazo agregado en los mismos dos bloques donde la 064 estampa: el INSERT
-- verificado de la mano de un profesional, y el UPDATE en el que quien aplicó
-- la dosis verifica su propia fila. Sigue sin tocar el camino de revisión de
-- campaña, donde quien revisa no aplicó nada y su firma no corresponde.
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

    -- 065: el portón.
    IF NEW.signature_id IS NULL THEN
      RAISE EXCEPTION 'Cargá tu firma en Ajustes antes de firmar una vacunación.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3 · El certificado
--
-- Cuerpo de la 064 con la condición del encabezado: el bloque entero —estampar
-- y rechazar— pasa a mirar también `has_pet_access(NEW.pet_id, 'edit')`.
--
-- Se agrega además la rama de firma ajena que la 064 no tenía y que las otras
-- dos superficies sí: la FK solo exige que la firma exista, así que sin esto
-- conocer el UUID de una colega alcanzaba para emitir un certificado con su
-- firma. Queda dicho porque es un rechazo nuevo que no pedía la tarea: se
-- agrega para que las tres superficies refusen lo mismo, y no dos de tres.
--
-- La matrícula la sigue exigiendo `pet_documents_insert_vet` (016) con
-- `type <> 'certificate' OR is_validated_vet()`, así que acá no se vuelve a
-- pedir.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_certificate_requires_signature()
RETURNS TRIGGER AS $$
DECLARE
  v_current UUID;
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
     AND my_vet_professional_id() IS NOT NULL
     AND NOT has_pet_access(NEW.pet_id, 'edit')
  THEN
    v_current := current_vet_signature_id();

    IF NEW.signature_id IS NULL THEN
      NEW.signature_id := v_current;
    ELSIF NEW.signature_id IS DISTINCT FROM v_current THEN
      RAISE EXCEPTION 'Un certificado se emite con la firma vigente de quien lo emite.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    -- 065: el portón.
    IF NEW.signature_id IS NULL THEN
      RAISE EXCEPTION 'Cargá tu firma en Ajustes antes de emitir un certificado.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- El trigger `pet_documents_certificate_signature` lo creó la 064 y sigue igual:
-- `BEFORE INSERT OR UPDATE ON pet_documents`. Acá solo cambia el cuerpo.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Volver a la 064 es sacar exactamente lo que esta migración agregó, y nada
-- más. En las tres funciones:
--
--   · Borrar los bloques marcados `-- 065: el portón.` y su `RAISE EXCEPTION`
--     de "Cargá tu firma en Ajustes…" (uno en la consulta, dos en la
--     vacunación, uno en el certificado).
--   · En `enforce_certificate_requires_signature()`: volver la condición del
--     bloque a `NEW.type = 'certificate' AND NEW.signature_id IS NULL AND
--     my_vet_professional_id() IS NOT NULL`, sacar el `DECLARE v_current UUID;`
--     y la rama `ELSIF` de firma ajena, y dejar el estampado en una sola línea
--     `NEW.signature_id := current_vet_signature_id();`.
--
-- El cuerpo exacto de las tres, tal como estaban antes de esta migración, está
-- en `db/migrations/064_vet_signature_freeze.sql`: revertir es pegar esos
-- tres bloques tal cual.
--
-- Revertir NO desestampa nada: los `signature_id` ya escritos son punteros
-- válidos a filas que siguen existiendo, y ni la 063 ni la 064 los exigen. Lo
-- que se recupera es poder firmar sin firma cargada. Antes de cualquier
-- despliegue, revertir es sencillamente no aplicarla.
