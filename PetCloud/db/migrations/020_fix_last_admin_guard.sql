-- ============================================================================
-- PetCloud — Migración 020: arreglo de la guarda del último administrador
-- municipal de la 017
--
-- Síntoma: un único administrador municipal podía degradarse a operador,
-- suspenderse o borrar su propia ficha de `municipality_staff` sin que nada lo
-- impidiera. El municipio quedaba sin nadie que pudiera gestionar usuarios,
-- zonas ni los datos de la institución.
--
-- Causa: `protect_last_municipality_admin()` quedó declarada `SECURITY
-- DEFINER`. Dentro de una función así, `current_user` **es la dueña de la
-- función** (postgres), no quien la invoca — y la exención decía justamente
-- `current_user IN ('service_role', 'postgres', 'supabase_admin')`. La guarda
-- se auto-eximía en todas las llamadas y nunca llegaba a contar admins.
--
-- Es la misma clase de defecto que la 009 (`enforce_signature_requires_
-- license`) ya documentó y arregló, y que la 019 (`protect_vet_privileges`)
-- evitó a propósito desde el principio. Ninguna edita la 017: las migraciones
-- aplicadas no se tocan (CONTRIBUTING.md), así que esta re-declara la función
-- con `CREATE OR REPLACE`.
--
-- Arreglo, dos cambios, los dos necesarios:
--
-- (a) Sacarle `SECURITY DEFINER`. El comentario original de la 017 justificaba
-- el definer porque "el conteo tiene que ser el real: leído como
-- 'authenticated' pasaría por la política de SELECT de la tabla, y un
-- recuento filtrado que devuelva 0 de más bloquearía bajas legítimas".
-- Revisado de nuevo, esa preocupación no se sostiene: `municipality_staff_
-- select` es `USING (municipality_id = my_municipality_id())`, y
-- `my_municipality_id()` es a su vez `SECURITY DEFINER` — un admin que actúa
-- sobre el personal de su propio municipio ve todas las filas de ese
-- municipio. El conteo es exacto en el único caso en que el trigger dispara.
-- Y la falla residual queda del lado seguro: una política hipotéticamente más
-- angosta haría que el conteo diera de menos, lo que sobre-bloquea (rechaza en
-- voz alta una baja legítima) en vez de sub-bloquear (permitir en silencio el
-- vaciamiento que el trigger existe para evitar).
--
-- (b) Ensanchar la tupla de exención con `supabase_auth_admin`. Sin esto, (a)
-- no puede salir sola: mientras la función era `SECURITY DEFINER`,
-- `current_user` era siempre `postgres` y la exención se cumplía siempre, así
-- que la cascada de borrado de cuenta nunca tocaba la excepción. Al dejar de
-- ser definer, `current_user` pasa a ser el rol real de la conexión — y
-- GoTrue cascadea `auth.users` → `profiles` → `municipality_staff` conectada
-- como `supabase_auth_admin`, que no estaba en la tupla original. Sin este
-- ensanche, arreglar (a) rompería el borrado de la cuenta de un admin único,
-- cambiando una guarda que nunca frenaba nada por una que frena hasta el
-- borrado legítimo de cuentas.
--
-- Ver el trigger `deleteUser sobre el único admin municipal debe funcionar`
-- en `tests/rls/administrador-municipal.test.ts`: es la prueba de regresión
-- de este punto exacto.
-- ============================================================================

CREATE OR REPLACE FUNCTION protect_last_municipality_admin()
RETURNS TRIGGER AS $$
DECLARE
  fila municipality_staff;
  otros_admins INTEGER;
BEGIN
  fila := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN fila;
  END IF;

  -- Solo importa la fila que hoy es admin activo: las demás no sostienen nada.
  IF OLD.role_in_municipality <> 'admin' OR OLD.status <> 'active' THEN
    RETURN fila;
  END IF;

  -- Sigue siendo admin activo del mismo municipio: el cambio es de otra columna.
  IF TG_OP = 'UPDATE'
     AND NEW.role_in_municipality = 'admin'
     AND NEW.status = 'active'
     AND NEW.municipality_id = OLD.municipality_id
  THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO otros_admins
  FROM municipality_staff
  WHERE municipality_id = OLD.municipality_id
    AND role_in_municipality = 'admin'
    AND status = 'active'
    AND id <> OLD.id;

  IF otros_admins = 0 THEN
    RAISE EXCEPTION
      'El municipio quedaría sin ningún administrador activo. Designá otro antes de cambiar o dar de baja a este.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN fila;
END;
-- Sin SECURITY DEFINER: acá `current_user` tiene que ser quien escribe de
-- verdad, que es lo que distingue a `authenticated` de `service_role` y de
-- `supabase_auth_admin`.
$$ LANGUAGE plpgsql SET search_path = public;

COMMENT ON FUNCTION protect_last_municipality_admin IS
  'Corrige el defecto de la 017: sin SECURITY DEFINER, current_user vuelve a '
  'ser quien invoca de verdad. Tupla de exención ensanchada con '
  'supabase_auth_admin para no romper la cascada de borrado de cuenta '
  '(migración 020).';

-- ----------------------------------------------------------------------------
-- Rollback: restaura el cuerpo de la 017 tal cual, con el mismo defecto.
-- Documentado como último recurso, no como un "deshacer" neutral: revertir
-- esta migración vuelve a dejar al municipio sin protección real contra
-- quedarse sin ningún administrador activo.
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION protect_last_municipality_admin()
-- RETURNS TRIGGER AS $$
-- DECLARE
--   fila municipality_staff;
--   otros_admins INTEGER;
-- BEGIN
--   fila := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
--
--   IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
--     RETURN fila;
--   END IF;
--
--   IF OLD.role_in_municipality <> 'admin' OR OLD.status <> 'active' THEN
--     RETURN fila;
--   END IF;
--
--   IF TG_OP = 'UPDATE'
--      AND NEW.role_in_municipality = 'admin'
--      AND NEW.status = 'active'
--      AND NEW.municipality_id = OLD.municipality_id
--   THEN
--     RETURN NEW;
--   END IF;
--
--   SELECT count(*) INTO otros_admins
--   FROM municipality_staff
--   WHERE municipality_id = OLD.municipality_id
--     AND role_in_municipality = 'admin'
--     AND status = 'active'
--     AND id <> OLD.id;
--
--   IF otros_admins = 0 THEN
--     RAISE EXCEPTION
--       'El municipio quedaría sin ningún administrador activo. Designá otro antes de cambiar o dar de baja a este.'
--       USING ERRCODE = 'restrict_violation';
--   END IF;
--
--   RETURN fila;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
