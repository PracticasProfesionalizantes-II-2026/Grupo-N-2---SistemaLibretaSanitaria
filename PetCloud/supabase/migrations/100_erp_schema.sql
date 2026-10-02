-- ============================================================================
-- PetCloud — Migración 100: schema `erp`
--
-- El ERP veterinario (stock, ventas, compras, caja, facturación, empleados) NO
-- vive en `public`. Vive en su propio schema de Postgres, y esta migración es
-- lo único que los dos schemas comparten.
--
-- POR QUÉ UN SCHEMA APARTE, y no simplemente tablas con prefijo `erp_`:
--
--   1. Frontera de permisos real. `public` es el dominio sanitario —mascotas,
--      vacunas, historia clínica, padrón municipal— y su superficie de acceso
--      ya está auditada por 43 migraciones y 13 suites de tests de RLS. El ERP
--      es un dominio nuevo, con otro dueño y otro ritmo de cambio. Un `DROP`
--      o un `GRANT` mal puesto del lado del ERP no puede alcanzar una sola
--      fila de historia clínica.
--
--   2. Frontera de trabajo real. PetCloud y el ERP los desarrollan personas
--      distintas, en paralelo. Dos schemas son dos territorios: el conflicto
--      de merge deja de ser la norma y pasa a ser la excepción.
--
--   3. El día que el ERP tenga que salir a otra base —porque escaló distinto,
--      porque un cliente lo pide on-premise, porque conviene— el corte ya
--      está hecho. Separar después cuesta mucho más que empezar separado.
--
-- LA NUMERACIÓN ARRANCA EN 100 A PROPÓSITO. `public` sigue en la serie
-- 0xx. El ERP usa 1xx. Con ~57 números de colchón, nadie tiene que renumerar
-- una migración porque el otro mergeó primero. Las dos series comparten la
-- regla de siempre: append-only, no se edita una aplicada, no se reusa un
-- número.
--
-- LO QUE ESTA MIGRACIÓN NO HACE: no crea ni una tabla de negocio. Crea el
-- schema, sus permisos y la función de acceso que todas las tablas del ERP van
-- a compartir. El primer módulo entra en la 101.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS erp;

COMMENT ON SCHEMA erp IS
  'ERP veterinario: stock, ventas, compras, caja, facturación y empleados. '
  'Separado de `public`, que es el dominio sanitario de PetCloud.';

-- ----------------------------------------------------------------------------
-- Permisos del schema
--
-- `USAGE` permite *entrar* al schema; no da acceso a ninguna tabla. Cada tabla
-- del ERP tiene que hacer su propio GRANT y habilitar su propia RLS. Es
-- deliberado: que agregar una tabla sin pensar en sus permisos no la exponga.
--
-- `anon` NO recibe nada. El ERP no tiene una sola pantalla pública — a
-- diferencia de `public`, donde la ficha del collar QR se lee sin sesión.
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA erp TO authenticated, service_role;
REVOKE ALL ON SCHEMA erp FROM anon;

-- Sin esto, PostgREST no puede resolver las funciones del schema aunque la
-- tabla tenga sus GRANT en orden.
ALTER DEFAULT PRIVILEGES IN SCHEMA erp
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ----------------------------------------------------------------------------
-- erp.has_access(institution_id)
--
-- La única puerta del ERP. TODA tabla de este schema usa esta función en sus
-- políticas de RLS, sin excepción y sin reescribir la condición a mano.
--
-- Combina las dos preguntas que ya sabe responder `public`:
--
--   · `is_institution_member()`  (040) — ¿esta persona trabaja acá?
--   · `institution_has_premium()` (040) — ¿esta veterinaria pagó el módulo?
--
-- Existe como función propia del schema `erp`, y no se llama a las dos
-- directamente en cada política, por una razón concreta: el día que el ERP
-- necesite una condición más —un permiso por rol para la caja, un estado de
-- habilitación fiscal— se agrega ACÁ y cubre todas las tablas de una vez. Si
-- cada política repitiera la condición, ese día habría que tocar treinta
-- políticas y confiar en no olvidarse de ninguna.
--
-- Mismo criterio que `has_pet_access()` (002) del lado sanitario: una función,
-- una fuente de verdad.
--
-- `STABLE` y `SET search_path = public, erp`: igual que todas las funciones de
-- seguridad del proyecto. Sin el `search_path` explícito, un usuario podría
-- anteponer un schema propio y secuestrar la resolución de nombres.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.has_access(p_institution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_institution_member(p_institution_id)
     AND public.institution_has_premium(p_institution_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, erp;

COMMENT ON FUNCTION erp.has_access(UUID) IS
  'Puerta única del ERP: miembro de la institución + Premium activo. '
  'Toda política de RLS del schema erp la usa; ninguna repite la condición.';

-- ----------------------------------------------------------------------------
-- erp.my_institution_id()
--
-- Atajo para las políticas de INSERT, que necesitan el id de la institución de
-- quien escribe y no lo reciben de ninguna fila. Envuelve la función de
-- `public` para que el código del ERP no dependa del nombre que tiene allá.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.my_institution_id()
RETURNS UUID AS $$
  SELECT public.my_vet_institution_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, erp;

-- ============================================================================
-- PLANTILLA — copiar tal cual para cada tabla nueva del ERP.
--
-- CREATE TABLE erp.<tabla> (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,
--   ...
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
--
-- -- Postgres NO indexa el lado hijo de una FK. Sin esto, cada borrado de una
-- -- institución hace seq scan, y los JOIN de RLS pagan lo mismo.
-- CREATE INDEX idx_<tabla>_institution ON erp.<tabla>(institution_id);
--
-- CREATE TRIGGER <tabla>_updated_at
--   BEFORE UPDATE ON erp.<tabla>
--   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
--
-- GRANT SELECT, INSERT, UPDATE ON erp.<tabla> TO authenticated;
-- ALTER TABLE erp.<tabla> ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "<tabla>_select" ON erp.<tabla> FOR SELECT
--   USING (erp.has_access(institution_id));
--
-- CREATE POLICY "<tabla>_insert" ON erp.<tabla> FOR INSERT
--   WITH CHECK (erp.has_access(institution_id));
--
-- -- El WITH CHECK del UPDATE no es opcional: sin él, un mismo UPDATE puede
-- -- mover la fila a otra institución. Es la cláusula que le faltaba a
-- -- `vet_institutions` (005) y que la 019 tuvo que compensar con un trigger.
-- CREATE POLICY "<tabla>_update" ON erp.<tabla> FOR UPDATE
--   USING (erp.has_access(institution_id))
--   WITH CHECK (erp.has_access(institution_id));
--
-- -- Sin política de DELETE, salvo que el negocio la exija. Un movimiento de
-- -- stock, una venta o un asiento de caja se anulan con un estado, no se
-- -- borran: la trazabilidad contable es el producto.
-- ============================================================================
