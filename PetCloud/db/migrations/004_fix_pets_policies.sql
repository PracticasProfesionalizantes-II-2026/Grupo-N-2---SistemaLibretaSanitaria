-- ============================================================================
-- PetCloud — Migración 004: arreglo de las políticas de `pets`
--
-- Síntoma: crear una mascota fallaba con
--   42501 "new row violates row-level security policy for table pets"
-- pero solo cuando el INSERT pedía la fila de vuelta. Sin `RETURNING` andaba.
--
-- Causa: la política de SELECT de la 002 era `USING (has_pet_access(id))`, y esa
-- función vuelve a consultar `pets`. Un INSERT con RETURNING tiene que pasar
-- también la política de SELECT sobre la fila nueva, y `has_pet_access` está
-- declarada `STABLE`: corre con el snapshot del inicio de la sentencia, donde la
-- fila **todavía no existe**. La política se evaluaba contra una tabla en la que
-- la mascota recién creada no figuraba, y daba falso.
--
-- Arreglo: para `pets` no hace falta preguntarle a nadie quién es el dueño — la
-- columna está en la propia fila que se está evaluando. Se lee directo y se
-- consulta `pet_shared_access`, que es otra tabla y sí está en el snapshot.
--
-- Las tablas hijas (vaccinations, weight_records, etc.) siguen usando
-- `has_pet_access(pet_id)` sin problema: consultan `pets`, que es una tabla
-- distinta de la que se está escribiendo, así que la mascota ya está ahí.
-- ============================================================================

DROP POLICY IF EXISTS "pets_select" ON pets;
DROP POLICY IF EXISTS "pets_update" ON pets;

CREATE POLICY "pets_select" ON pets FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pet_shared_access
      WHERE pet_shared_access.pet_id = pets.id
        AND pet_shared_access.shared_with_id = auth.uid()
    )
  );

CREATE POLICY "pets_update" ON pets FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pet_shared_access
      WHERE pet_shared_access.pet_id = pets.id
        AND pet_shared_access.shared_with_id = auth.uid()
        AND pet_shared_access.permission = 'edit'
    )
  );
