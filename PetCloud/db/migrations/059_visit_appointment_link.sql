-- ============================================================================
-- PetCloud — Migración 059: la visita que sabe de qué turno viene
--
-- `appointments` (041) y `visits` (008) venían siendo dos módulos sin una sola
-- columna en común. La consecuencia diaria es que un turno atendido queda
-- `scheduled` para siempre: el mostrador cierra la visita en la sala de espera
-- y nadie vuelve a la agenda a marcar el turno. El dueño, que lee sus turnos
-- por `get_pet_appointments()`, ve un turno futuro que ya ocurrió.
--
-- POR QUÉ EL VÍNCULO VA EN UNA SOLA DIRECCIÓN
--
-- `visits.appointment_id`, y NO un `appointments.visit_id` espejo. Dos claves
-- cruzadas serían dos lugares donde vive la misma verdad, y el día que se
-- desincronicen no hay forma de saber cuál miente. La visita es la que nace
-- después, así que es la que apunta. Para ir turno -> visita alcanza el índice
-- único de abajo, que además es lo que impide que dos visitas se adjudiquen el
-- mismo turno.
--
-- POR QUÉ LA CLAVE ES COMPUESTA
--
-- Mismo criterio que la 057/115 en el ERP: una FK sobre `id` solo comprueba
-- que el turno exista, no que sea de esta veterinaria. Sin el par, la sala de
-- espera de una clínica podría cerrar una visita contra el turno de otra; con
-- él, el turno de otra institución ni siquiera es referenciable. De ahí la
-- única redundante sobre `appointments(id, institution_id)`: `id` ya es PK, no
-- agrega una regla, agrega el **destino** que Postgres exige para la FK.
--
-- `ON DELETE SET NULL (appointment_id)` —la lista de columnas existe de PG 15
-- en adelante y acá corre 17— anula solo esa columna. Sin la lista, Postgres
-- intentaría anular también `institution_id`, que es NOT NULL, y el borrado
-- fallaría. Hoy no hay política de DELETE sobre `appointments` (un turno se
-- cancela, no se borra), así que el único camino que llega acá es el CASCADE
-- de `vet_institutions`; la cláusula está por lo que pase mañana, no por lo
-- que pasa hoy.
--
-- LO QUE LA FK NO ALCANZA A GARANTIZAR
--
-- La clave compuesta garantiza misma institución. No garantiza **misma
-- mascota**: nada en ella impide colgar la visita de una mascota del turno de
-- otra dentro de la misma clínica. Eso corrompe las dos historias clínicas, así
-- que va un trigger. No es paranoia: el `pet_id` del turno es nullable (041) y
-- el de la visita no, y esa asimetría es justo la que hace fácil equivocarse.
-- ============================================================================

ALTER TABLE appointments
  ADD CONSTRAINT appointments_id_institution_key
  UNIQUE (id, institution_id);

COMMENT ON CONSTRAINT appointments_id_institution_key ON appointments IS
  'Redundante como unicidad (id ya es PK) y obligatoria como destino: la FK '
  'compuesta de visits sobre (appointment_id, institution_id) necesita una '
  'restriccion unica sobre exactamente este par.';

ALTER TABLE visits
  ADD COLUMN appointment_id UUID;

ALTER TABLE visits
  ADD CONSTRAINT visits_appointment_same_institution_fkey
  FOREIGN KEY (appointment_id, institution_id)
  REFERENCES appointments (id, institution_id)
  ON DELETE SET NULL (appointment_id);

COMMENT ON COLUMN visits.appointment_id IS
  'Turno del que nace esta visita, si nace de uno. NULL es el caso normal: la '
  'sala de espera atiende por orden de llegada y la mayoria de las visitas no '
  'vienen de una agenda.';

-- Un turno produce una visita y no dos. Parcial porque NULL es el caso
-- frecuente y un único total dejaría pasar una sola visita sin turno.
CREATE UNIQUE INDEX idx_visits_appointment_unico
  ON visits (appointment_id)
  WHERE appointment_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- visits_appointment_matches_pet
--
-- La FK compuesta cubre la institución; esto cubre la mascota. Se permite el
-- turno sin `pet_id` (041 lo deja nullable: un hueco reservado en la agenda
-- todavía sin paciente asignado) porque ahí no hay nada que contradecir.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION visits_appointment_matches_pet()
RETURNS TRIGGER AS $$
DECLARE
  v_appointment_pet UUID;
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.pet_id INTO v_appointment_pet
  FROM appointments a
  WHERE a.id = NEW.appointment_id;

  IF v_appointment_pet IS NOT NULL AND v_appointment_pet <> NEW.pet_id THEN
    RAISE EXCEPTION
      'El turno % es de otra mascota y no puede vincularse a esta visita',
      NEW.appointment_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER visits_appointment_matches_pet_check
  BEFORE INSERT OR UPDATE OF appointment_id, pet_id ON visits
  FOR EACH ROW EXECUTE FUNCTION visits_appointment_matches_pet();

-- ----------------------------------------------------------------------------
-- close_visit_with_appointment
--
-- Cierra la visita y, si vino de un turno, lo marca `attended` — las dos cosas
-- en una transacción. Antes esto eran dos `UPDATE` desde el cliente: si el
-- segundo fallaba, la visita quedaba cerrada y el turno colgado en `scheduled`
-- sin que nadie se enterara.
--
-- POR QUÉ ES `SECURITY DEFINER` Y NO DOS UPDATE CON RLS
--
-- Las políticas de `appointments` (041) exigen `institution_has_premium()`. Las
-- de `visits` (008) no. Una clínica sin Premium cierra visitas hoy y tiene que
-- poder seguir cerrándolas: si el UPDATE del turno pasara por RLS, el cierre
-- entero le devolvería un error por un módulo que esa clínica ni siquiera usa.
-- Por eso la función saltea RLS y comprueba la pertenencia **a mano**, con
-- `is_institution_member()` —la de la 058, la que excluye a los dados de baja—
-- leyendo la institución **de la visita**, nunca de un parámetro. Quien llama
-- no elige sobre qué institución opera.
--
-- Nótese que esto no le da agenda gratis a nadie: sin Premium no se pueden
-- crear ni leer turnos, así que una clínica free nunca va a tener un
-- `appointment_id` que sincronizar. La función existe para que el cierre no se
-- rompa, no para abrir el módulo.
--
-- POR QUÉ UN TURNO CANCELADO NO PASA A `attended`
--
-- Un turno cancelado es una decisión que alguien tomó. Si la mascota igual vino
-- y se la atendió, eso es una visita espontánea, no la resurrección del turno.
-- Lo mismo para `no_show`: ya se declaró que no vino. Solo avanzan `scheduled`
-- y `confirmed`, que son los estados que todavía esperan algo. La función
-- devuelve el estado real del turno para que quien llama sepa qué pasó en vez
-- de suponerlo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_visit_with_appointment(
  p_visit_id UUID,
  p_medical_record_id UUID DEFAULT NULL,
  p_summary TEXT DEFAULT NULL
)
RETURNS TABLE (
  closed_visit_id UUID,
  linked_appointment_id UUID,
  appointment_status TEXT
) AS $$
DECLARE
  v_institution_id UUID;
  v_appointment_id UUID;
  v_status TEXT;
BEGIN
  SELECT v.institution_id, v.appointment_id
    INTO v_institution_id, v_appointment_id
  FROM visits v
  WHERE v.id = p_visit_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'La visita % no existe', p_visit_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT is_institution_member(v_institution_id) THEN
    RAISE EXCEPTION 'No pertenecés a la institución de esta visita'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE visits
  SET status = 'completed',
      completed_at = now(),
      medical_record_id = p_medical_record_id,
      summary = NULLIF(btrim(COALESCE(p_summary, '')), '')
  WHERE id = p_visit_id;

  IF v_appointment_id IS NOT NULL THEN
    UPDATE appointments a
    SET status = 'attended'
    WHERE a.id = v_appointment_id
      AND a.status IN ('scheduled', 'confirmed')
    RETURNING a.status INTO v_status;

    IF v_status IS NULL THEN
      SELECT a.status INTO v_status FROM appointments a WHERE a.id = v_appointment_id;
    END IF;
  END IF;

  RETURN QUERY SELECT p_visit_id, v_appointment_id, v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION close_visit_with_appointment(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_visit_with_appointment(UUID, UUID, TEXT) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION close_visit_with_appointment(UUID, UUID, TEXT) FROM authenticated;
-- DROP FUNCTION IF EXISTS close_visit_with_appointment(UUID, UUID, TEXT);
-- DROP TRIGGER IF EXISTS visits_appointment_matches_pet_check ON visits;
-- DROP FUNCTION IF EXISTS visits_appointment_matches_pet();
-- DROP INDEX IF EXISTS idx_visits_appointment_unico;
-- ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_appointment_same_institution_fkey;
-- ALTER TABLE visits DROP COLUMN IF EXISTS appointment_id;
-- ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_id_institution_key;
