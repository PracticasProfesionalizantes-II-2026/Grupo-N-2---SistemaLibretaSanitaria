-- ============================================================================
-- PetCloud — Migración 005: cortar la recursión entre políticas
--
-- Síntoma: después de la 004, crear una mascota falla con
--   42P17 "infinite recursion detected in policy for relation pets"
--
-- Causa: dos políticas que se llaman entre sí.
--
--   pets_select          consulta pet_shared_access
--     └─ shared_access_select  consulta pets
--          └─ pets_select ...
--
-- Cada tabla preguntaba por la otra para decidir quién puede leerla, y PostgreSQL
-- corta el ciclo con un error. No alcanzaba con arreglar un lado: mientras las
-- dos políticas se consulten mutuamente, el ciclo vuelve.
--
-- Arreglo: las consultas cruzadas pasan por funciones `SECURITY DEFINER`, que
-- corren como dueñas de la tabla y por lo tanto **no vuelven a disparar RLS**.
-- Cada función lee una sola tabla, así que no queda ningún camino de ida y
-- vuelta entre políticas.
--
-- La regla que queda para adelante: una política de RLS nunca consulta otra
-- tabla que también tenga RLS de forma directa. Si necesita hacerlo, va por una
-- función `SECURITY DEFINER` que toque una sola tabla.
-- ============================================================================

-- ¿Es la dueña de esta mascota? Lee solo `pets`.
CREATE OR REPLACE FUNCTION is_pet_owner(p_pet_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets WHERE id = p_pet_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ¿Le compartieron esta mascota? Lee solo `pet_shared_access`.
CREATE OR REPLACE FUNCTION has_shared_pet_access(
  p_pet_id UUID,
  p_min_permission share_permission DEFAULT 'view'
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pet_shared_access
    WHERE pet_id = p_pet_id
      AND shared_with_id = auth.uid()
      AND (p_min_permission = 'view' OR permission = 'edit')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- pets
--
-- `owner_id` se lee de la propia fila candidata y no con una subconsulta: es lo
-- que permite que un INSERT con RETURNING funcione. Una función `STABLE` que
-- consulte `pets` usa el snapshot del inicio de la sentencia, donde la fila que
-- se está insertando todavía no está — ese fue el error 42501 de la 004.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "pets_select" ON pets;
DROP POLICY IF EXISTS "pets_update" ON pets;

CREATE POLICY "pets_select" ON pets FOR SELECT
  USING (owner_id = auth.uid() OR has_shared_pet_access(id));

CREATE POLICY "pets_update" ON pets FOR UPDATE
  USING (owner_id = auth.uid() OR has_shared_pet_access(id, 'edit'));

-- ----------------------------------------------------------------------------
-- pet_shared_access
--
-- Mismo criterio del otro lado del ciclo: la comprobación de propiedad va por
-- `is_pet_owner`, que no dispara la política de `pets`.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "shared_access_select" ON pet_shared_access;
DROP POLICY IF EXISTS "shared_access_insert" ON pet_shared_access;
DROP POLICY IF EXISTS "shared_access_update" ON pet_shared_access;
DROP POLICY IF EXISTS "shared_access_delete" ON pet_shared_access;

CREATE POLICY "shared_access_select" ON pet_shared_access FOR SELECT
  USING (shared_with_id = auth.uid() OR is_pet_owner(pet_id));

CREATE POLICY "shared_access_insert" ON pet_shared_access FOR INSERT
  WITH CHECK (is_pet_owner(pet_id));

CREATE POLICY "shared_access_update" ON pet_shared_access FOR UPDATE
  USING (is_pet_owner(pet_id));

CREATE POLICY "shared_access_delete" ON pet_shared_access FOR DELETE
  USING (is_pet_owner(pet_id));

-- ----------------------------------------------------------------------------
-- El titular de la baja de equipo, mismo patrón
--
-- `vet_professionals` tenía una política de DELETE que consultaba la propia
-- tabla. No llegaba a recursión porque su política de SELECT es `USING (true)`,
-- pero dependía de ese detalle: si algún día se restringe esa lectura, el ciclo
-- aparece. Se cierra ahora, mientras la tabla está vacía y no cuesta nada.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_institution_owner(p_institution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vet_professionals
    WHERE institution_id = p_institution_id
      AND profile_id = auth.uid()
      AND role_in_institution = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "Vet owners can remove team members" ON vet_professionals;
DROP POLICY IF EXISTS "Vet owners can update own institution" ON vet_institutions;

CREATE POLICY "Vet owners can remove team members"
  ON vet_professionals FOR DELETE
  USING (
    is_institution_owner(institution_id)
    AND role_in_institution <> 'owner'
  );

CREATE POLICY "Vet owners can update own institution"
  ON vet_institutions FOR UPDATE
  USING (is_institution_owner(id));
