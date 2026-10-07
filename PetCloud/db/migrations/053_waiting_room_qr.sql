-- ============================================================================
-- PetCloud — Migración 053: autogestión de sala de espera por QR
--
-- Hoy una mascota solo entra a la cola si un profesional corre `checkIn()`
-- (`waiting-room-actions.ts:28-67`), y `visits_insert` (008:299-300) solo
-- acepta `institution_id = my_vet_institution_id()`. Esta migración agrega
-- una segunda puerta de escritura a `visits`, mucho más angosta: una función
-- `SECURITY DEFINER`, `waiting_room_self_check_in()`, que un dueño autenticado
-- llama con un código de sesión rotativo y el id de su mascota. `visits_insert`
-- no se toca — sigue siendo byte-idéntica a la 008.
--
-- `waiting_room_qr_sessions` está modelada sobre `campaign_qr_sessions` (042):
-- misma forma de sesión con ventana de validez y revocación, mismo motivo
-- para que el dueño nunca tenga SELECT sobre la tabla (leería el código vivo
-- de cualquier institución).
--
-- ----------------------------------------------------------------------------
-- Por qué el índice único parcial es `WHERE revoked_at IS NULL` y nada más
-- ----------------------------------------------------------------------------
--
-- El predicado de un índice tiene que ser IMMUTABLE, y `now()` no lo es —
-- Postgres lo rechaza al crear el índice. Por eso "vigente" (`revoked_at IS
-- NULL AND valid_until > now()`) no puede ser el predicado completo: solo
-- entra la mitad que no depende del reloj.
--
-- La consecuencia, y es la parte que importa operacionalmente: una sesión
-- vencida pero todavía no revocada (`revoked_at IS NULL`, `valid_until` ya
-- pasado) sigue ocupando el único lugar que este índice permite por
-- institución. Si `issueWaitingRoomQrSession` intentara simplemente INSERTar
-- una sesión nueva, chocaría contra esa fila vencida y fallaría con una
-- violación de unicidad — para el usuario, "emitir un código nuevo" rompería
-- justo cuando el código anterior ya no sirve.
--
-- La acción de emitir tiene que revocar incondicionalmente (poner
-- `revoked_at = now()` en toda fila viva de esa institución, esté vencida o
-- no) ANTES de insertar la nueva. Eso no es responsabilidad de esta
-- migración — vive en `issueWaitingRoomQrSession` (fase 4) — pero el índice
-- de acá es lo que hace que revocar-antes-de-insertar sea obligatorio y no
-- una prolijidad opcional. Misma forma exacta que
-- `idx_campaign_qr_sessions_live` (042:59-61) y el mismo motivo.
--
-- ----------------------------------------------------------------------------
-- Por qué la función devuelve un `outcome TEXT` y nunca un RAISE con ERRCODE
-- ----------------------------------------------------------------------------
--
-- `accept_pet_share_invite()` (045:141-171) ya sienta el precedente contrario
-- que acá se evita a propósito: el SQLSTATE de una excepción viaja al
-- cliente sin pedir permiso, y se vuelve el canal de filtración exacto que
-- el spec prohíbe (Requirement "Check-In Without Pet Access Discloses
-- Nothing" — el mismo mensaje de rechazo para "la mascota no existe" que
-- para "la mascota es de otro dueño"). Un `RAISE EXCEPTION` con un ERRCODE
-- por motivo sería indistinguible de eso: cada motivo se convierte en una
-- señal reconocible del lado del cliente. Por eso la función nunca lanza
-- para un rechazo de negocio: siempre retorna una fila `(outcome, visit_id)`,
-- y el llamador decide qué mostrar. El único RAISE alcanzable en este camino
-- sigue siendo el de `visits_set_owner()` (008:187-189, SQLSTATE P0001), y no
-- es alcanzable acá porque el acceso a la mascota ya se probó antes del
-- INSERT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- waiting_room_qr_sessions
-- ----------------------------------------------------------------------------
CREATE TABLE waiting_room_qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  issued_by UUID REFERENCES vet_professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until > valid_from)
);

CREATE INDEX idx_waiting_room_qr_sessions_institution
  ON waiting_room_qr_sessions(institution_id, valid_until DESC);

-- Una sola sesión VIVA por institución. El predicado es `revoked_at IS NULL`
-- y nada más — ver el encabezado de esta migración para el motivo y su
-- consecuencia operativa (revocar incondicionalmente antes de emitir).
-- Misma forma que `idx_campaign_qr_sessions_live` (042:59-61).
CREATE UNIQUE INDEX idx_waiting_room_qr_sessions_live
  ON waiting_room_qr_sessions(institution_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER waiting_room_qr_sessions_updated_at
  BEFORE UPDATE ON waiting_room_qr_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY — waiting_room_qr_sessions
-- ============================================================================

ALTER TABLE waiting_room_qr_sessions ENABLE ROW LEVEL SECURITY;

-- Nunca FORCE ROW LEVEL SECURITY — mismo motivo que 017/024/025/042: la
-- función `SECURITY DEFINER` de más abajo necesita que el dueño de la tabla
-- quede exento de su propia RLS.

CREATE POLICY "waiting_room_qr_sessions_select_institution"
  ON waiting_room_qr_sessions FOR SELECT
  USING (is_institution_member(institution_id));

CREATE POLICY "waiting_room_qr_sessions_insert"
  ON waiting_room_qr_sessions FOR INSERT
  WITH CHECK (
    is_institution_member(institution_id)
    AND issued_by = my_vet_professional_id()
  );

-- `USING`/`WITH CHECK` coinciden a propósito (regla de la 019/041: nunca un
-- UPDATE sin `WITH CHECK` que le permita a una fila "mudarse" a otra
-- institución en el mismo UPDATE).
CREATE POLICY "waiting_room_qr_sessions_update_institution"
  ON waiting_room_qr_sessions FOR UPDATE
  USING (is_institution_member(institution_id))
  WITH CHECK (is_institution_member(institution_id));

-- Sin DELETE: una sesión se revoca (`revoked_at`), nunca se borra — mismo
-- criterio que `campaign_qr_sessions` (042:93-94).

-- El dueño nunca tiene SELECT sobre esta tabla: listaría el código vivo de
-- cualquier institución. Su única puerta es la función de abajo, exactamente
-- como `resolve_campaign_qr_session()` (042:124-171) lo es para campañas.

-- ----------------------------------------------------------------------------
-- waiting_room_self_check_in — la única puerta de escritura del dueño a `visits`
-- ----------------------------------------------------------------------------
--
-- Devuelve `('ok', <visit id>)` o `(<motivo>, NULL)`. Nunca lanza una
-- excepción para un rechazo de negocio — ver el encabezado de esta migración.
-- Motivos posibles: 'code_not_live' | 'pet_unavailable' | 'already_waiting'.
--
-- El orden de las validaciones ES el mecanismo de seguridad, no un detalle
-- de implementación:
--   1. Sesión viva (código resuelve a una institución)
--   2. `has_pet_access(p_pet_id, 'edit')`
--   3. No hay visita abierta para esa mascota en esa institución
-- `pet_unavailable` cubre "la mascota no existe" y "la mascota es de otro
-- dueño" con el mismo resultado, porque `has_pet_access()` (035:74-88) ya
-- devuelve `false` para ambos casos — un solo predicado alcanza para las dos
-- mitades del requisito de no divulgación. Y `already_waiting` solo es
-- alcanzable DESPUÉS de que el acceso a la mascota fue probado: ningún
-- resultado le informa a quien llama algo sobre una mascota que no podía ver
-- de entrada.
CREATE OR REPLACE FUNCTION waiting_room_self_check_in(
  p_code TEXT,
  p_pet_id UUID
)
RETURNS TABLE (outcome TEXT, visit_id UUID) AS $$
DECLARE
  v_institution_id UUID;
  v_visit_id UUID;
BEGIN
  SELECT s.institution_id INTO v_institution_id
  FROM waiting_room_qr_sessions s
  WHERE s.code = p_code
    AND s.revoked_at IS NULL
    AND now() BETWEEN s.valid_from AND s.valid_until;

  IF v_institution_id IS NULL THEN
    RETURN QUERY SELECT 'code_not_live'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- `has_pet_access` ya devuelve false para una mascota inexistente, así que
  -- un solo predicado cubre las dos mitades del requisito de no divulgación.
  -- Deliberadamente no hay chequeo de "mascota dada de baja": `pets`
  -- (002:39-62, más 013/032) no tiene esa columna.
  IF NOT has_pet_access(p_pet_id, 'edit') THEN
    RETURN QUERY SELECT 'pet_unavailable'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM visits v
    WHERE v.pet_id = p_pet_id
      AND v.institution_id = v_institution_id
      AND v.status IN ('waiting', 'in_progress')
  ) THEN
    RETURN QUERY SELECT 'already_waiting'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Las cuatro columnas que el dueño nunca puede elegir son literales acá, y
  -- `institution_id` sale únicamente de la sesión resuelta arriba, nunca de
  -- un parámetro. `owner_id` queda para `visits_set_owner_before_write`
  -- (008:195-197), que corre después de este INSERT.
  INSERT INTO visits (pet_id, institution_id, status, checked_in_by_id,
                      reason, is_urgent)
  VALUES (p_pet_id, v_institution_id, 'waiting', NULL, NULL, false)
  RETURNING id INTO v_visit_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION waiting_room_self_check_in(TEXT, UUID) IS
  'Única puerta por la que un dueño escribe en visits. Nunca RAISE para un '
  'rechazo de negocio: el SQLSTATE es en sí mismo un canal de divulgación. '
  'institution_id sale solo de la sesión resuelta, nunca de un parámetro.';

GRANT EXECUTE ON FUNCTION waiting_room_self_check_in(TEXT, UUID) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION waiting_room_self_check_in(TEXT, UUID) FROM authenticated;
-- DROP FUNCTION IF EXISTS waiting_room_self_check_in(TEXT, UUID);
-- DROP TRIGGER IF EXISTS waiting_room_qr_sessions_updated_at ON waiting_room_qr_sessions;
-- DROP TABLE IF EXISTS waiting_room_qr_sessions CASCADE;
--
-- Adición pura: ninguna fila preexistente depende de esta tabla ni de esta
-- función. Las filas de `visits` ya creadas por autogestión son visitas
-- ordinarias — indistinguibles de un check-in manual salvo por
-- `checked_in_by_id IS NULL`, que ya era un valor válido antes de esta
-- migración — y quedan como están si se revierte.
