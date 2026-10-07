-- ============================================================================
-- PetCloud ERP — Migración 104: vocabulario de permisos del ERP
--
-- Esta migración no toca ni una tabla de negocio. Prepara el terreno para las
-- que vienen: Compras (105) ya la necesita, Caja (106), Clientes (107) y
-- Ventas (108) también, y Equipo (sin migración propia, slice 5) es la
-- pantalla que la administra.
--
-- POR QUÉ ACÁ Y NO CUANDO HAGA FALTA. El schema es append-only: agregar la
-- política de un módulo y, dos migraciones después, volver a tocarla para
-- sumarle la condición de permiso es exactamente la duplicación que la
-- plantilla de `100_erp_schema.sql:70-76` existe para evitar. Compras, Caja,
-- Clientes y Ventas nacen ya gateadas por `erp.has_access(institution_id,
-- '<módulo>')` desde su primera versión.
--
-- POR QUÉ NO EN `src/config/vet-permissions.ts`. Ese archivo es dominio
-- sanitario — territorio del otro desarrollador (`docs/EN-CURSO.md`) — y
-- acoplar el ERP a su forma sería depender para siempre de un archivo que no
-- se mantiene desde acá. El ERP tiene su propia pregunta de acceso
-- (`erp.has_access`) y ahora su propio vocabulario de permisos, en su propio
-- schema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- erp.module_grants — quién puede usar qué módulo
--
-- Decisión 5 del diseño: Stock y Ventas los tiene todo el mundo desde
-- siempre, así que NO aparecen acá como algo que se "otorga" — el overload de
-- `has_access` de abajo los deja pasar sin consultar esta tabla. Lo que esta
-- tabla registra es la delegación de Caja, Compras, Equipo y reportes, que
-- arrancan solo para el titular.
--
-- `UNIQUE(institution_id, professional_id, module)`: un mismo permiso no se
-- otorga dos veces. Repetir el `INSERT` no es un error del usuario — es la
-- pantalla de Equipo re-enviando el mismo estado del checkbox — así que el
-- índice único convierte ese caso en un conflicto legible, no en una fila
-- duplicada silenciosa.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.module_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.vet_professionals(id) ON DELETE CASCADE,

  module TEXT NOT NULL CHECK (module IN (
    'stock', 'ventas', 'caja', 'compras', 'reportes', 'equipo'
  )),

  granted_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_module_grants UNIQUE (institution_id, professional_id, module)
);

-- Postgres no indexa el lado hijo de una FK (100:118-119).
CREATE INDEX idx_erp_module_grants_institution ON erp.module_grants(institution_id);
CREATE INDEX idx_erp_module_grants_professional ON erp.module_grants(professional_id);
CREATE INDEX idx_erp_module_grants_granted_by ON erp.module_grants(granted_by);

CREATE TRIGGER erp_module_grants_updated_at
  BEFORE UPDATE ON erp.module_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- erp.has_access(institution_id, module) — overload de dos argumentos
--
-- El de un argumento (100) NO se toca: `erp.products` y `erp.stock_movements`
-- (101) siguen resolviendo contra él tal cual, y así se quedan hasta que
-- alguien decida migrarlos — no es tarea de esta migración.
--
-- Composición, no reescritura: este overload llama al de un argumento y le
-- suma la pregunta de módulo. `stock` y `ventas` siempre pasan (decisión 5:
-- nadie pierde lo que ya tenía). El titular siempre pasa. Cualquier otro
-- módulo depende de una fila en `module_grants`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.has_access(p_institution_id UUID, p_module TEXT)
RETURNS BOOLEAN AS $$
  SELECT erp.has_access(p_institution_id) AND (
      p_module IN ('stock', 'ventas')
   OR public.is_institution_owner(p_institution_id)
   OR EXISTS (
        SELECT 1 FROM erp.module_grants g
         WHERE g.institution_id = p_institution_id
           AND g.module = p_module
           AND g.professional_id = public.my_vet_professional_id()
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, erp;

COMMENT ON FUNCTION erp.has_access(UUID, TEXT) IS
  'Puerta del ERP con permiso por módulo. Stock y Ventas quedan abiertos para '
  'todo miembro Premium; el resto requiere ser titular o tener una fila en '
  'erp.module_grants. El overload de un argumento (100) sigue intacto.';

-- ============================================================================
-- Permisos y RLS de erp.module_grants — plantilla de la 100, con una
-- excepción deliberada en el INSERT.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON erp.module_grants TO authenticated;
ALTER TABLE erp.module_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_grants_select" ON erp.module_grants FOR SELECT
  USING (erp.has_access(institution_id));

-- No se usa `erp.has_access(institution_id)` a secas para el INSERT: cualquier
-- miembro Premium pasaría esa puerta, y delegar permisos no es una acción de
-- cualquier miembro — es la que el requirement "Only the owner can delegate
-- ERP permissions" (erp-team) exige restringir. `is_institution_owner()` es
-- la misma función que ya usa `vet_institutions` (005) para la misma pregunta.
CREATE POLICY "module_grants_insert" ON erp.module_grants FOR INSERT
  WITH CHECK (public.is_institution_owner(institution_id));

-- El WITH CHECK no es opcional: sin él, un mismo UPDATE podría mover la fila
-- a otra institución (mismo agujero que `vet_institutions`, 005/019).
CREATE POLICY "module_grants_update" ON erp.module_grants FOR UPDATE
  USING (public.is_institution_owner(institution_id))
  WITH CHECK (public.is_institution_owner(institution_id));

-- Sin DELETE: revocar un permiso no borra la fila con service role, y desde la
-- aplicación no hay revocación por borrado — queda para cuando la pantalla de
-- Equipo (slice 5) decida su propio mecanismo (probablemente una columna de
-- estado, no un DELETE, siguiendo la regla de "nada se borra" del módulo).
