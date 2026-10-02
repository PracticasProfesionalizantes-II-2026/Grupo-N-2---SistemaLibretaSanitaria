-- ============================================================================
-- PetCloud — Migración 043: revisión de declaraciones de campaña
--
-- Segunda mitad de la autodeclaración (042 dio de alta `campaign_qr_sessions`).
-- Esta migración le da a `vaccinations` la columna que dice qué sesión de QR
-- autorizó la dosis (`declaration_session_id`) y el ciclo de vida de revisión
-- (`review_status`), más el blindaje de datos que hace que `verified = true`
-- solo pueda salir del camino de revisión — nunca de un INSERT/UPDATE directo.
--
-- **Hallazgo corregido de paso** (finding #5 del prompt de lanzamiento, ver
-- design.md "Correction to the launch prompt"): hoy, sin esta migración, un
-- dueño puede poner `verified = true` en CUALQUIERA de sus propias filas de
-- `vaccinations` — de campaña o no — porque las políticas `vaccinations_update`
-- y la de INSERT de la 002 no tienen ningún `WITH CHECK` que lo bloquee, y
-- `vaccinations_update_vet` (008) sólo cubre las filas que un veterinario ya
-- aplicó (`applied_by_id` es NULL en las del dueño, así que ni siquiera
-- compite). Una política nueva sólo puede *ampliar* acceso, nunca cerrarlo —
-- por eso el cierre es el trigger de más abajo, no una política más estricta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Columnas nuevas
--
-- `review_status` domina el mismo terreno que `verified`, pero con cuatro
-- estados en vez de un booleano — mismo argumento que ya justificó
-- `municipality_participating_vets.status` (025) en vez de dos booleanos:
-- "pending" y "rejected" no son combinaciones de otra cosa, son estados
-- propios. El `CHECK` de más abajo ata los dos para que nunca puedan
-- contradecirse, así que ningún contador existente (022, 028, 030, 038,
-- `mappers.ts`) tiene que aprender sobre `review_status` para seguir siendo
-- correcto: todos ya filtran por `verified`.
--
-- `NOT NULL DEFAULT 'not_applicable'` es metadata-only en Postgres 11+ (sin
-- reescritura de tabla ni backfill): toda fila que ya existe hoy —aplicada por
-- veterinario o cargada de memoria por el dueño— sigue significando
-- exactamente lo mismo que significaba ayer.
-- ----------------------------------------------------------------------------
ALTER TABLE vaccinations
  ADD COLUMN declaration_session_id UUID REFERENCES campaign_qr_sessions(id) ON DELETE SET NULL,
  ADD COLUMN review_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (review_status IN ('not_applicable', 'pending', 'verified', 'rejected')),
  ADD COLUMN reviewed_by_id UUID REFERENCES vet_professionals(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN rejection_reason TEXT,
  ADD COLUMN declared_distance_m INTEGER,
  ADD CONSTRAINT vaccinations_review_status_matches_verified CHECK (
    review_status = 'not_applicable'
    OR (review_status IN ('pending', 'rejected') AND NOT verified)
    OR (review_status = 'verified' AND verified)
  );

-- Una declaración por mascota por sesión: cubre el doble escaneo y también a
-- dos codueños de la misma mascota, porque la clave es la mascota y no el
-- usuario. El segundo intento vuelve como "ya declarada", no como error.
CREATE UNIQUE INDEX idx_vaccinations_one_declaration_per_session
  ON vaccinations(declaration_session_id, pet_id)
  WHERE declaration_session_id IS NOT NULL;

-- La cola de revisión del veterinario: siempre filtra por `review_status =
-- 'pending'`, nunca por `declaration_session_id` solo.
CREATE INDEX idx_vaccinations_pending_review
  ON vaccinations(declaration_session_id)
  WHERE review_status = 'pending';

-- ----------------------------------------------------------------------------
-- Política de revisión — el camino que hoy no existe
--
-- `vaccinations` ya tiene políticas de UPDATE hoy: `vaccinations_update` (002,
-- dueño con acceso de edición) y `vaccinations_update_vet` (008, el propio
-- veterinario que aplicó la dosis). Ninguna alcanza a un miembro de la
-- institución que emitió el QR de una declaración ajena — por eso hacía falta
-- una política nueva, no alcanzaba con reinterpretar las que ya había.
--
-- `USING`/`WITH CHECK` coinciden a propósito (misma regla que la política de
-- UPDATE de `campaign_qr_sessions`, 042): sin el `WITH CHECK`, un UPDATE
-- podría "mudar" la fila fuera del alcance de esta política en el mismo golpe.
-- Qué transición puntual es legal (`pending → verified` / `pending →
-- rejected`, y no otra) lo decide el trigger de más abajo, no esta política —
-- mismo reparto de responsabilidades que 025 documentó para
-- `municipality_participating_vets`.
-- ----------------------------------------------------------------------------
CREATE POLICY "vaccinations_update_campaign_review" ON vaccinations FOR UPDATE
  USING (
    declaration_session_id IS NOT NULL
    AND is_institution_member(qr_session_institution_id(declaration_session_id))
  )
  WITH CHECK (
    declaration_session_id IS NOT NULL
    AND is_institution_member(qr_session_institution_id(declaration_session_id))
  );

-- ----------------------------------------------------------------------------
-- campaign_qr_session_is_live — soporte del trigger de más abajo
--
-- El trigger `protect_vaccination_verification()` deliberadamente NO es
-- `SECURITY DEFINER` (ver su propio comentario), así que corre con los
-- privilegios reales de quien escribe. El dueño que declara una dosis no
-- tiene ninguna política de SELECT sobre `campaign_qr_sessions` (042): sin
-- este helper `SECURITY DEFINER`, el propio trigger no podría leer la sesión
-- que necesita validar. Mismo motivo que ya resolvió `campaign_municipality_id()`
-- (024) para las tablas hijas de `campaigns`.
--
-- También cierra, a nivel de datos, el requirement "Cancelled Campaign Stops
-- Accepting New Declarations" (campaign-qr-session spec): si alguien saltea
-- `resolveCampaignQrSession()` y llama al INSERT directo con una sesión
-- todavía vigente pero de una campaña ya cancelada o cerrada, esto también lo
-- corta.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION campaign_qr_session_is_live(p_session_id UUID, p_campaign_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM campaign_qr_sessions s
    JOIN campaigns c ON c.id = s.campaign_id
    WHERE s.id = p_session_id
      AND s.campaign_id = p_campaign_id
      AND s.revoked_at IS NULL
      AND now() BETWEEN s.valid_from AND s.valid_until
      AND c.status NOT IN ('cancelled', 'finished')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- protect_vaccination_verification — el blindaje de datos
--
-- **Deliberadamente NO `SECURITY DEFINER`** (misma lección que la 019 dejó
-- escrita para `protect_vet_privileges`): dentro de una función definer,
-- `current_user` pasa a ser la dueña de la función, y la exención de abajo
-- para `service_role`/`postgres`/`supabase_admin` se cumpliría siempre —
-- rompiendo exactamente la distinción que este trigger necesita hacer entre
-- la service role (que sí puede escribir cualquier cosa, p. ej. `recordVaccination`
-- del veterinario vía `createAdminClient()`) y un usuario autenticado común.
--
-- Sigue la tabla de eventos del design.md:
--
--  1. INSERT, quien escribe no es veterinario (`my_vet_professional_id() IS
--     NULL`): fuerza `verified := false`, `applied_by_id := NULL`, y
--     `review_status` a `'pending'` si hay sesión o `'not_applicable'` si no
--     la hay. Cierra la mitad INSERT del hueco preexistente (encabezado):
--     ya no se puede insertar `verified: true` ni un `applied_by_id` forjado
--     desde el lado del dueño.
--  2. INSERT, quien no es veterinario intenta fijar `campaign_id` sin una
--     `declaration_session_id` viva: aborta — nadie reclama una campaña sin
--     pasar por un QR vigente.
--  3. INSERT, `declaration_session_id` presente pero la sesión no está viva
--     (revocada, fuera de ventana, o de otra campaña): aborta.
--  4. UPDATE que reasigna `declaration_session_id` o `campaign_id`: aborta —
--     mismo criterio de "reasignar de fila no es una revisión" que la 025
--     documentó para `municipality_id`/`vet_institution_id`.
--  5. UPDATE de una fila con sesión, por alguien que NO es miembro de la
--     institución emisora: revierte en silencio `verified`, `review_status`,
--     `reviewed_by_id`, `reviewed_at`, `rejection_reason` a los valores OLD —
--     el resto del UPDATE sigue su curso, mismo patrón que
--     `protect_vet_privileges` (019).
--  6. UPDATE de una fila con sesión, por un miembro, con una transición que
--     no sea `pending → verified` ni `pending → rejected`: aborta.
--  7. UPDATE de una fila SIN sesión (dosis aplicada por veterinario o cargada
--     de memoria por el dueño), por cualquiera que no sea el propio
--     veterinario que la aplicó: revierte las mismas cinco columnas. Esto es
--     lo que cierra la mitad UPDATE del hueco preexistente — hoy, sin esto,
--     el dueño con acceso de edición a la mascota puede pasar cualquiera de
--     sus propias filas (de campaña o no) a `verified: true`.
--
-- Exime a `service_role`/`postgres`/`supabase_admin`, como 019/025.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_vaccination_verification()
RETURNS TRIGGER AS $$
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

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' a partir de acá.

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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vaccinations_protect_verification
  BEFORE INSERT OR UPDATE ON vaccinations
  FOR EACH ROW EXECUTE FUNCTION protect_vaccination_verification();

-- ----------------------------------------------------------------------------
-- municipality_campaign_progress() v2 — separa aplicadas de autodeclaradas
-- pendientes
--
-- `applied_doses` ya filtraba `FILTER (WHERE v.verified)` desde la 030: una
-- dosis autodeclarada y todavía no revisada nunca infló la cobertura, ni
-- antes ni ahora. Lo que faltaba era la *visibilidad* de la cola pendiente —
-- requirement "Verified and Self-Declared Figures Are Never Mixed"
-- (campaign-dose-attribution spec).
--
-- Postgres no permite `CREATE OR REPLACE FUNCTION` cuando cambian los
-- parámetros OUT — hay que dropearla primero. El resto del cuerpo es idéntico
-- al de la 030 (misma validación, mismo JOIN, mismo GROUP BY), con una sola
-- columna agregada al SELECT.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS municipality_campaign_progress();

CREATE OR REPLACE FUNCTION municipality_campaign_progress()
RETURNS TABLE (
  campaign_id UUID,
  applied_doses INT,
  self_declared_pending INT
) AS $$
BEGIN
  IF NOT is_validated_municipality() THEN
    RAISE EXCEPTION
      'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    COUNT(v.id) FILTER (WHERE v.verified)::int AS applied_doses,
    COUNT(v.id) FILTER (WHERE v.review_status = 'pending')::int AS self_declared_pending
  FROM campaigns c
  LEFT JOIN vaccinations v ON v.campaign_id = c.id
  WHERE c.municipality_id = my_municipality_id()
  GROUP BY c.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION municipality_campaign_progress IS
  'Dosis aplicadas y autodeclaradas pendientes por campaña, toda la '
  'jurisdicción en una sola llamada. v2 (043): agrega self_declared_pending '
  'sin cambiar el significado de applied_doses (030).';

GRANT EXECUTE ON FUNCTION municipality_campaign_progress() TO authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS municipality_campaign_progress();
-- CREATE OR REPLACE FUNCTION municipality_campaign_progress()
-- RETURNS TABLE (campaign_id UUID, applied_doses INT) AS $$
-- BEGIN
--   IF NOT is_validated_municipality() THEN
--     RAISE EXCEPTION 'Esta cuenta municipal todavía no fue validada por el equipo de PetCloud.'
--       USING ERRCODE = 'insufficient_privilege';
--   END IF;
--   RETURN QUERY
--   SELECT c.id, COUNT(v.id) FILTER (WHERE v.verified)::int AS applied_doses
--   FROM campaigns c
--   LEFT JOIN vaccinations v ON v.campaign_id = c.id
--   WHERE c.municipality_id = my_municipality_id()
--   GROUP BY c.id;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
-- GRANT EXECUTE ON FUNCTION municipality_campaign_progress() TO authenticated;
--
-- DROP TRIGGER IF EXISTS vaccinations_protect_verification ON vaccinations;
-- DROP FUNCTION IF EXISTS protect_vaccination_verification();
-- DROP FUNCTION IF EXISTS campaign_qr_session_is_live(UUID, UUID);
-- DROP POLICY IF EXISTS "vaccinations_update_campaign_review" ON vaccinations;
-- DROP INDEX IF EXISTS idx_vaccinations_pending_review;
-- DROP INDEX IF EXISTS idx_vaccinations_one_declaration_per_session;
-- ALTER TABLE vaccinations
--   DROP CONSTRAINT IF EXISTS vaccinations_review_status_matches_verified,
--   DROP COLUMN IF EXISTS declared_distance_m,
--   DROP COLUMN IF EXISTS rejection_reason,
--   DROP COLUMN IF EXISTS reviewed_at,
--   DROP COLUMN IF EXISTS reviewed_by_id,
--   DROP COLUMN IF EXISTS review_status,
--   DROP COLUMN IF EXISTS declaration_session_id;
--
-- Revertir esta migración restaura exactamente `municipality_campaign_progress()`
-- v1 (030) y deja `vaccinations` como estaba antes de la 043. Ninguna fila
-- pierde datos clínicos: solo desaparecen las columnas de revisión de
-- campaña, que no existían hasta esta migración. Revertir siempre 043 antes
-- que 042 (orden inverso al de aplicación) — esta migración depende de
-- `campaign_qr_sessions` y de `qr_session_institution_id()`.
