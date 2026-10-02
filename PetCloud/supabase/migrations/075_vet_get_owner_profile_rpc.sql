-- ============================================================================
-- PetCloud — Migración 075: el contacto del dueño en la ficha del paciente
--
-- `pets_select_vet` (008) es `USING (is_vet())`: cualquier profesional abre la
-- ficha de cualquier mascota. Pero el perfil del dueño solo lo alcanza
-- `vet_reads_patient_owner` (012), que exige que la institución ya haya tenido
-- una visita o un registro clínico con alguna mascota de esa persona. Resultado:
-- en la primera atención —justo cuando más hace falta llamar— el join embebido
-- `profiles:owner_id(...)` volvía `null` y la ficha mostraba el dueño vacío.
--
-- `get_pet_owner_profile_for_vet(p_pet_id)` es `SECURITY DEFINER` y devuelve
-- **solo** lo que la ficha muestra: id, nombre, apellido, teléfono, dirección y
-- avatar del dueño principal (`pets.owner_id`). El email vive en `auth.users` y
-- no sale de acá; tampoco el rol ni ninguna otra columna de `profiles`.
--
-- Por qué no una política más amplia sobre `profiles`: RLS es por fila, no por
-- columna. Una política nueva expondría la fila entera a cualquier veterinario,
-- incluida cualquier columna que se le agregue a `profiles` mañana. La función
-- fija la lista de columnas.
--
-- ALCANCE, y es una decisión aceptada, no un descuido: la guarda es `is_vet()`
-- (cualquier fila en `vet_professionals`, incluida recepción y matrícula sin
-- validar), igual que `pets_select_vet`. O sea que cualquier profesional puede
-- leer nombre, teléfono y dirección del dueño de cualquier mascota cuyo id
-- conozca. Es el mismo alcance que ya tiene sobre la mascota misma; si algún
-- día se restringe `pets_select_vet`, esta función es lo segundo que hay que
-- mirar.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pet_owner_profile_for_vet(p_pet_id UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_vet() THEN
    RAISE EXCEPTION 'Solo un profesional veterinario puede ver el contacto del dueño.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.first_name, pr.last_name, pr.phone, pr.address, pr.avatar_url
  FROM public.pets p
  JOIN public.profiles pr ON pr.id = p.owner_id
  WHERE p.id = p_pet_id;
END;
$$;

COMMENT ON FUNCTION get_pet_owner_profile_for_vet(UUID) IS
  'Contacto del dueño principal para la ficha del paciente, solo para '
  'veterinarios (is_vet). Sin email. 075.';

REVOKE ALL ON FUNCTION get_pet_owner_profile_for_vet(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_pet_owner_profile_for_vet(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_pet_owner_profile_for_vet(UUID) TO authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS get_pet_owner_profile_for_vet(UUID);
