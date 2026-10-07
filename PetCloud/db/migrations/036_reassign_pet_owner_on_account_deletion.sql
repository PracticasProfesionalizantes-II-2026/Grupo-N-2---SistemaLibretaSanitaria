-- ============================================================================
-- PetCloud — Migración 036: no perder una mascota por borrar la cuenta de un
-- codueño, si queda otro
--
-- Límite real que dejó la 035, verificado con un script antes de escribir
-- esto: `pets.owner_id REFERENCES profiles(id) ON DELETE CASCADE` no sabe
-- nada de codueños — si la cuenta que está en `owner_id` se borra, la mascota
-- entera desaparece con ella, aunque `pet_shared_access` tenga otro dueño
-- perfectamente válido esperando.
--
-- La regla ya vigente desde la 035 es "una mascota siempre necesita al menos
-- un dueño" (trigger `protect_last_pet_owner`, que bloquea sacar al último).
-- Esta migración aplica la misma regla al borrado de cuenta: si queda otro
-- codueño, `owner_id` se le reasigna a él ANTES de que el CASCADE decida que
-- la mascota se queda sin nadie. Si no queda ninguno, no hay nada que
-- reasignar y la mascota se borra igual que hoy — es exactamente el
-- comportamiento actual para el caso de un solo dueño, sin cambios.
--
-- Va en un trigger `BEFORE DELETE ON profiles`, no en la aplicación: la
-- cuenta se puede borrar por muchos caminos (backoffice, el servicio de auth
-- directo, un futuro flujo de "borrar mi cuenta"), y la regla tiene que
-- cumplirse pase lo que pase, no solo cuando la borra un botón específico.
-- Se dispara también en cascada desde `auth.users` — `profiles.id REFERENCES
-- auth.users(id) ON DELETE CASCADE` — porque Postgres corre los triggers de
-- fila de la tabla dependiente aunque el borrado llegue por CASCADE, no solo
-- en un DELETE directo.
-- ============================================================================

CREATE OR REPLACE FUNCTION reassign_pet_owner_before_profile_delete()
RETURNS TRIGGER AS $$
DECLARE
  mascota RECORD;
  nuevo_dueno UUID;
BEGIN
  FOR mascota IN SELECT id FROM pets WHERE owner_id = OLD.id LOOP
    SELECT shared_with_id INTO nuevo_dueno
    FROM pet_shared_access
    WHERE pet_id = mascota.id
      AND permission = 'owner'
      AND shared_with_id <> OLD.id
    ORDER BY created_at ASC
    LIMIT 1;

    IF nuevo_dueno IS NOT NULL THEN
      UPDATE pets SET owner_id = nuevo_dueno WHERE id = mascota.id;
    END IF;
    -- Sin otro codueño: no se toca nada, y el CASCADE de siempre se encarga.
  END LOOP;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER profiles_reassign_pet_owner
  BEFORE DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION reassign_pet_owner_before_profile_delete();

-- ROLLBACK
-- DROP TRIGGER IF EXISTS profiles_reassign_pet_owner ON profiles;
-- DROP FUNCTION IF EXISTS reassign_pet_owner_before_profile_delete();
