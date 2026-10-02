-- ============================================================================
-- PetCloud — Migración 041: turnos (primer módulo Premium)
--
-- `appointments` es el primer módulo cuya visibilidad depende de
-- `institution_has_premium()` (040): las tres políticas de RLS la combinan
-- con `is_institution_member()`, así que una institución que pierde Premium
-- deja de poder leer o escribir turnos, pero los datos no se borran — vuelven
-- a estar disponibles enteros en cuanto la suscripción se reactiva.
--
-- `appointments_update` tiene `WITH CHECK` explícito, la cláusula que le
-- falta a `vet_institutions` (005) y que la 019 tuvo que compensar con un
-- trigger: sin ella, un mismo `UPDATE` podría mover el turno a otra
-- institución. Se agrega desde el día uno, no como parche posterior.
--
-- No hay política de DELETE: un turno se cancela (`status = 'cancelled'`),
-- no se borra — mismo criterio que `reminders` (002) y la regla de producto
-- de que los datos sobreviven a cualquier baja o vencimiento.
--
-- El dueño de la mascota nunca lee esta tabla por una política de RLS
-- directa: leería `internal_notes`, que es la nota clínica interna del
-- profesional y nunca tiene que llegar al dueño (mismo motivo por el que
-- 019 separó columnas de historia clínica de lo que el dueño puede ver).
-- En cambio, `get_pet_appointments()` es `SECURITY DEFINER` y proyecta solo
-- las columnas seguras, reutilizando `has_pet_access()` (035) para cubrir
-- también a los codueños.
-- ============================================================================

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES vet_professionals(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 5 AND 480),
  reason TEXT NOT NULL,
  internal_notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'attended', 'no_show', 'cancelled')),
  created_by UUID REFERENCES vet_professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_agenda ON appointments(institution_id, starts_at);
CREATE INDEX idx_appointments_pet ON appointments(pet_id, starts_at DESC);

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_select" ON appointments FOR SELECT
  USING (is_institution_member(institution_id) AND institution_has_premium(institution_id));

CREATE POLICY "appointments_insert" ON appointments FOR INSERT
  WITH CHECK (is_institution_member(institution_id) AND institution_has_premium(institution_id));

CREATE POLICY "appointments_update" ON appointments FOR UPDATE
  USING (is_institution_member(institution_id) AND institution_has_premium(institution_id))
  WITH CHECK (is_institution_member(institution_id) AND institution_has_premium(institution_id));

-- ----------------------------------------------------------------------------
-- get_pet_appointments
--
-- Vista de solo lectura para el dueño: nunca expone `internal_notes` ni
-- `institution_id`/`professional_id` crudos, y no está gateada por premium
-- de la institución — el turno de un dueño no tiene que desaparecer porque
-- la veterinaria dejó de pagar (regla de "los datos sobreviven a la baja").
-- `has_pet_access()` (035) ya cubre codueños, así que no hace falta repetir
-- esa lógica acá.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_pet_appointments(p_pet_id UUID)
RETURNS TABLE (
  id UUID,
  starts_at TIMESTAMPTZ,
  duration_min INTEGER,
  reason TEXT,
  status TEXT,
  institution_name TEXT,
  professional_name TEXT
) AS $$
  SELECT a.id, a.starts_at, a.duration_min, a.reason, a.status, i.name,
         COALESCE(p.first_name || ' ' || p.last_name, '')
  FROM appointments a
  JOIN vet_institutions i ON i.id = a.institution_id
  LEFT JOIN vet_professionals vp ON vp.id = a.professional_id
  LEFT JOIN profiles p ON p.id = vp.profile_id
  WHERE a.pet_id = p_pet_id AND has_pet_access(p_pet_id)
  ORDER BY a.starts_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION get_pet_appointments(UUID) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION get_pet_appointments(UUID) FROM authenticated;
-- DROP FUNCTION IF EXISTS get_pet_appointments(UUID);
-- DROP TABLE IF EXISTS appointments;
