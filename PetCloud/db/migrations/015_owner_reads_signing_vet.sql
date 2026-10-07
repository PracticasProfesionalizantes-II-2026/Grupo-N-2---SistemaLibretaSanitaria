-- 015 · El dueño ve quién firmó la consulta de su mascota
--
-- La libreta en PDF sale con la matrícula del profesional pero sin su nombre:
-- "MP QA-F5" y nada más. El dato existe en `profiles`, pero un dueño solo puede
-- leer su propia fila, así que el join vuelve nulo y la firma queda anónima.
--
-- Es raro en cualquier documento sanitario y es raro acá también: la 010 ya se
-- ocupó de que ese mismo dueño pueda ver la **imagen** de la firma de quien
-- firmó un registro suyo. Ver el garabato y no el nombre no tiene defensa.
--
-- El criterio es el mismo de siempre: no se abre `profiles` "a los dueños", se
-- abre la relación que ya existe y quedó registrada. Un profesional es visible
-- para quien tiene una consulta firmada por él sobre su propia mascota — la
-- misma condición que `signed_for_my_pet()`, mirada desde el otro lado.

/**
 * ¿Este perfil es el de un profesional que firmó algo de una mascota mía?
 *
 * SECURITY DEFINER porque adentro lee `medical_records`, `vet_professionals` y
 * `pets` sin que se evalúen sus políticas: es lo que evita que una política de
 * `profiles` termine consultando tablas cuyas políticas miran `profiles`.
 *
 * `is_signed = true` explícito, igual que en la 010: un borrador no publica
 * nada, ni el registro ni quién lo estaba escribiendo.
 */
CREATE OR REPLACE FUNCTION signed_a_record_for_my_pet(p_profile_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM medical_records m
    JOIN vet_professionals vp ON vp.id = m.vet_professional_id
    JOIN pets p ON p.id = m.pet_id
    WHERE vp.profile_id = p_profile_id
      AND m.is_signed = true
      AND p.owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_vet_professionals_profile
  ON vet_professionals(profile_id);

DROP POLICY IF EXISTS "owner_reads_signing_vet" ON profiles;
CREATE POLICY "owner_reads_signing_vet"
  ON profiles FOR SELECT
  USING (signed_a_record_for_my_pet(id));

-- Solo SELECT, y la fila que se expone no tiene email ni credenciales: nombre,
-- apellido, teléfono, avatar y rol. Para un profesional que firmó un acto médico
-- eso es menos de lo que figura en cualquier receta en papel.
