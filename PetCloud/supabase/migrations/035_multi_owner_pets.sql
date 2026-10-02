-- ============================================================================
-- PetCloud — Migración 035: dueño↔mascota pasa a N:N
--
-- Segundo paso (el 034 solo agregó el valor 'owner' al enum). Acá:
--
--   1. Se migra cada `pets.owner_id` existente a una fila `pet_shared_access`
--      con permission='owner' — cero pérdida de datos, cada mascota conserva
--      exactamente el dueño que ya tenía.
--   2. Un trigger nuevo hace lo mismo automáticamente para cada mascota que
--      se cree de acá en más.
--   3. `has_pet_access()` y `has_shared_pet_access()` tenían un bug real que
--      esto expone: comparaban `permission = 'edit'` a mano, así que una fila
--      con permission='owner' fallaba el chequeo de nivel 'edit' aunque
--      'owner' incluye todo lo que 'edit' puede. Se corrige a `permission >=
--      p_min_permission`, que funciona para los tres niveles porque el enum
--      ya quedó declarado en orden de capacidad (view < edit < owner).
--   4. `is_pet_owner()` (la usan las cuatro políticas de `pet_shared_access`)
--      ahora también reconoce a un codueño agregado por esta tabla, no solo
--      al `owner_id` original — así cualquier dueño, no solo el primero,
--      puede compartir o revocar acceso.
--   5. `pets_delete` se actualiza para aceptar también a un codueño. No se
--      toca `pets_select`/`pets_update`: ya llamaban a `has_shared_pet_access`
--      desde la 005, así que el arreglo del punto 3 les llega solo.
--   6. Un trigger nuevo bloquea borrar o degradar al último dueño de una
--      mascota — decisión explícita: una mascota siempre necesita al menos
--      un dueño, iguial que hoy. No interfiere con borrar la mascota entera
--      ni con el CASCADE de borrar la cuenta del dueño original: en los dos
--      casos la fila de `pets` ya desapareció antes de que este trigger
--      evalúe nada, así que no hay nada que proteger.
--
-- `pets.owner_id` NO se toca ni se borra en esta migración. Sigue siendo una
-- columna real, protegida por el trigger que ya existía (`protect_pet_ownership`),
-- y el código de la aplicación puede seguir leyéndola mientras se adapta el
-- resto de las pantallas — retirarla es una migración aparte, más adelante,
-- después de confirmar que nada la necesita.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Backfill: cada mascota existente ya tiene su fila de dueño en la tabla
-- nueva. `ON CONFLICT` es una red de seguridad, no algo que se espere usar:
-- `sharePetAccess` ya impide compartir una mascota con su propio owner_id, así
-- que hoy no puede haber una fila previa para (pet_id, owner_id).
-- ----------------------------------------------------------------------------
INSERT INTO pet_shared_access (pet_id, shared_with_id, permission)
SELECT id, owner_id, 'owner'
FROM pets
ON CONFLICT (pet_id, shared_with_id) DO UPDATE SET permission = 'owner';

-- ----------------------------------------------------------------------------
-- 2. De acá en más, cada mascota nueva registra a su creador como dueño en
-- la tabla de accesos, automáticamente. `SECURITY DEFINER` por el mismo
-- motivo que `track_pet_qr_code` (003... en realidad 002): quien crea la
-- mascota todavía no tiene ninguna fila en `pet_shared_access`, así que sin
-- esto la propia política de INSERT de esa tabla lo bloquearía.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_pet_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pet_shared_access (pet_id, shared_with_id, permission)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (pet_id, shared_with_id) DO UPDATE SET permission = 'owner';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER pets_track_owner
  AFTER INSERT ON pets
  FOR EACH ROW EXECUTE FUNCTION track_pet_owner();

-- ----------------------------------------------------------------------------
-- 3. El bug de comparación: 'owner' no satisfacía el chequeo de nivel 'edit'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_pet_access(
  p_pet_id UUID,
  p_min_permission share_permission DEFAULT 'view'
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets
    WHERE id = p_pet_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM pet_shared_access
    WHERE pet_id = p_pet_id
      AND shared_with_id = auth.uid()
      AND permission >= p_min_permission
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION has_shared_pet_access(
  p_pet_id UUID,
  p_min_permission share_permission DEFAULT 'view'
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pet_shared_access
    WHERE pet_id = p_pet_id
      AND shared_with_id = auth.uid()
      AND permission >= p_min_permission
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- 4. Un codueño (no solo el owner_id original) puede gestionar accesos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_pet_owner(p_pet_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets WHERE id = p_pet_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM pet_shared_access
    WHERE pet_id = p_pet_id AND shared_with_id = auth.uid() AND permission = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- 5. Borrar la mascota: el owner_id original o cualquier codueño.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "pets_delete" ON pets;

CREATE POLICY "pets_delete" ON pets FOR DELETE
  USING (owner_id = auth.uid() OR has_shared_pet_access(id, 'owner'));

-- ----------------------------------------------------------------------------
-- 6. Una mascota siempre necesita al menos un dueño.
--
-- El chequeo `NOT EXISTS (SELECT 1 FROM pets WHERE id = ...)` es lo que
-- distingue "alguien está tratando de sacar al último dueño mientras la
-- mascota sigue existiendo" (se bloquea) de "esto es un CASCADE porque la
-- mascota (o la cuenta del owner_id original) ya se borró" (se deja pasar,
-- ya no hay nada que proteger). En un CASCADE por FK, la fila referenciada
-- desaparece antes de que se disparen los triggers de la fila dependiente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_last_pet_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pets WHERE id = OLD.pet_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE' AND OLD.permission = 'owner')
     OR (TG_OP = 'UPDATE' AND OLD.permission = 'owner' AND NEW.permission <> 'owner')
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM pet_shared_access
      WHERE pet_id = OLD.pet_id AND permission = 'owner' AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'Una mascota siempre necesita al menos un dueño.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER pet_shared_access_protect_last_owner
  BEFORE UPDATE OR DELETE ON pet_shared_access
  FOR EACH ROW EXECUTE FUNCTION protect_last_pet_owner();

-- ROLLBACK
-- DROP TRIGGER IF EXISTS pet_shared_access_protect_last_owner ON pet_shared_access;
-- DROP FUNCTION IF EXISTS protect_last_pet_owner();
-- DROP POLICY IF EXISTS "pets_delete" ON pets;
-- CREATE POLICY "pets_delete" ON pets FOR DELETE USING (owner_id = auth.uid());
-- DROP FUNCTION IF EXISTS is_pet_owner(UUID); -- recrear la versión de la 005 si hace falta
-- DROP TRIGGER IF EXISTS pets_track_owner ON pets;
-- DROP FUNCTION IF EXISTS track_pet_owner();
--
-- Las filas permission='owner' insertadas por el backfill y por el trigger
-- quedan en la tabla: son datos reales (reflejan quién es dueño de qué), no
-- algo que un rollback de esta migración deba borrar por su cuenta.
