-- ============================================================================
-- PetCloud — Migración 042: sesiones de QR de campaña (autodeclaración del dueño)
--
-- Primer artefacto de primera clase de la autodeclaración: `campaign_qr_sessions`
-- es UNA sesión operativa (campaña + preset de vacuna + lote + institución
-- emisora + ventana de validez), direccionada por un código que jamás puede
-- confundirse con el del collar (`PCC-XXXX-XXXX-XXXX` vs `PC-XXXX-XXXX`, ver
-- design.md — la generación/clasificación del código es fase 2, no acá).
--
-- Copia congelada del preset: mismo criterio de no retroactividad que
-- `vet_subscriptions.amount_cents` (040). Cubre el borde "el preset se editó o
-- se borró después de emitir el QR" — una dosis declarada nunca puede quedar
-- sin nombre de vacuna, ni cambiar de significado retroactivamente.
--
-- El dueño **nunca** tiene SELECT sobre esta tabla — leería los códigos vivos
-- de cualquier institución. La única puerta de lectura para quien declara es
-- `resolve_campaign_qr_session()`, `SECURITY DEFINER`, que proyecta solo lo que
-- la pantalla de declaración necesita. Mismo patrón que `get_pet_appointments()`
-- (041) para `appointments`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- campaign_qr_sessions
-- ----------------------------------------------------------------------------
CREATE TABLE campaign_qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  preset_id UUID REFERENCES vaccine_presets(id) ON DELETE SET NULL,
  -- Copia congelada del preset: misma regla de no retroactividad que
  -- `vet_subscriptions.amount_cents` (040). Cubre el borde "el preset se editó
  -- o se borró después de emitir el QR": una dosis declarada nunca puede
  -- quedar sin nombre de vacuna.
  vaccine_name TEXT NOT NULL,
  manufacturer TEXT,
  dose_number TEXT,
  application_route application_route,
  booster_interval_days INTEGER NOT NULL DEFAULT 365,
  species pet_species[] NOT NULL DEFAULT '{}',
  lot_number TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  issued_by UUID REFERENCES vet_professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until > valid_from)
);

CREATE INDEX idx_campaign_qr_sessions_campaign
  ON campaign_qr_sessions(campaign_id, valid_until DESC);

-- Una sola sesión viva por (campaña, institución, preset): emitir de nuevo
-- revoca la anterior, y este índice lo vuelve un invariante de datos y no una
-- convención de la acción (fase 3, `issueCampaignQrSession`). `preset_id` NULL
-- (preset borrado) queda exento, porque en Postgres los NULL son distintos
-- entre sí en un índice único.
CREATE UNIQUE INDEX idx_campaign_qr_sessions_live
  ON campaign_qr_sessions(campaign_id, institution_id, preset_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER campaign_qr_sessions_updated_at
  BEFORE UPDATE ON campaign_qr_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY — campaign_qr_sessions
-- ============================================================================

ALTER TABLE campaign_qr_sessions ENABLE ROW LEVEL SECURITY;

-- Nunca FORCE ROW LEVEL SECURITY — mismo motivo que 017/024/025: las funciones
-- `SECURITY DEFINER` de más abajo (y las de 043 que leen esta tabla) necesitan
-- que el dueño de la tabla quede exento de su propia RLS.

CREATE POLICY "campaign_qr_sessions_select_institution" ON campaign_qr_sessions FOR SELECT
  USING (is_institution_member(institution_id));

CREATE POLICY "campaign_qr_sessions_insert" ON campaign_qr_sessions FOR INSERT
  WITH CHECK (
    is_institution_member(institution_id)
    AND issued_by = my_vet_professional_id()
  );

-- `USING`/`WITH CHECK` coinciden a propósito (regla de la 041/019: nunca un
-- UPDATE sin `WITH CHECK` que le permita a una fila "mudarse" a otra
-- institución en el mismo UPDATE).
CREATE POLICY "campaign_qr_sessions_update_institution" ON campaign_qr_sessions FOR UPDATE
  USING (is_institution_member(institution_id))
  WITH CHECK (is_institution_member(institution_id));

-- Sin DELETE: una sesión se revoca (`revoked_at`), no se borra — mismo
-- criterio que `appointments` (041) y `municipality_participating_vets` (025).

-- ----------------------------------------------------------------------------
-- Funciones auxiliares
--
-- Ambas `SECURITY DEFINER STABLE`, con `search_path` fijo — mismo patrón que
-- `campaign_municipality_id()`/`campaign_is_public()` (024). El dueño nunca
-- tiene SELECT sobre `campaign_qr_sessions` (ver encabezado), así que sin
-- `SECURITY DEFINER` ninguna de las dos podría leer la tabla del lado del
-- dueño.
-- ----------------------------------------------------------------------------

-- La institución que emitió una sesión, para la política de revisión de
-- `vaccinations` (043) y para cualquier otra tabla que necesite escalar hasta
-- "qué institución puede revisar esta declaración" sin repetir el JOIN.
CREATE OR REPLACE FUNCTION qr_session_institution_id(p_session_id UUID)
RETURNS UUID AS $$
  SELECT institution_id FROM campaign_qr_sessions WHERE id = p_session_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION qr_session_institution_id(UUID) TO authenticated;

-- Resolución pública del código: la única puerta de lectura del dueño. Un
-- código mal escrito, vencido, revocado o de una campaña ya cancelada/cerrada
-- (requirement "Cancelled Campaign Stops Accepting New Declarations",
-- campaign-qr-session spec) devuelve cero filas, nunca un error — mismo
-- criterio de "no distinguir código inventado de código muerto" que ya usa el
-- collar. Proyecta exactamente lo que la pantalla de declaración necesita
-- (campaña, vacuna, especies, lote, vigencia, puntos con coordenadas), nunca
-- una fila cruda de `campaign_qr_sessions`.
CREATE OR REPLACE FUNCTION resolve_campaign_qr_session(p_code TEXT)
RETURNS TABLE (
  session_id UUID,
  code TEXT,
  campaign_id UUID,
  campaign_name TEXT,
  vaccine_name TEXT,
  manufacturer TEXT,
  lot_number TEXT,
  dose_number TEXT,
  application_route application_route,
  booster_interval_days INTEGER,
  species pet_species[],
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  locations JSONB
) AS $$
  SELECT
    s.id,
    s.code,
    s.campaign_id,
    c.name,
    s.vaccine_name,
    s.manufacturer,
    s.lot_number,
    s.dose_number,
    s.application_route,
    s.booster_interval_days,
    s.species,
    s.valid_from,
    s.valid_until,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('latitude', l.latitude, 'longitude', l.longitude))
       FROM campaign_locations l
       WHERE l.campaign_id = s.campaign_id
         AND l.latitude IS NOT NULL
         AND l.longitude IS NOT NULL),
      '[]'::jsonb
    ) AS locations
  FROM campaign_qr_sessions s
  JOIN campaigns c ON c.id = s.campaign_id
  WHERE s.code = p_code
    AND s.revoked_at IS NULL
    AND now() BETWEEN s.valid_from AND s.valid_until
    AND c.status NOT IN ('cancelled', 'finished');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION resolve_campaign_qr_session(TEXT) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION resolve_campaign_qr_session(TEXT) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION qr_session_institution_id(UUID) FROM authenticated;
-- DROP FUNCTION IF EXISTS resolve_campaign_qr_session(TEXT);
-- DROP FUNCTION IF EXISTS qr_session_institution_id(UUID);
-- DROP TRIGGER IF EXISTS campaign_qr_sessions_updated_at ON campaign_qr_sessions;
-- DROP TABLE IF EXISTS campaign_qr_sessions CASCADE;
--
-- Adición pura: ninguna fila preexistente depende de esta tabla. Si la 043 ya
-- corrió, revertirla primero — su FK (`vaccinations.declaration_session_id`),
-- su política de revisión y su trigger dependen de esta tabla y de
-- `qr_session_institution_id()`.
