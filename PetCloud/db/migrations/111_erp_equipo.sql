-- ============================================================================
-- PetCloud ERP — Migración 111: revocar un permiso del equipo
--
-- La 104 (104_erp_permisos.sql:121-124) dejó `erp.module_grants` sin política
-- de DELETE a propósito, y anotó que la revocación quedaba para esta pantalla
-- "probablemente como un estado, no un DELETE, siguiendo la regla de nada se
-- borra". Esta migración cumple esa promesa.
--
-- POR QUÉ UNA COLUMNA Y NO UN DELETE. Borrar la fila perdería quién otorgó el
-- permiso y cuándo — el mismo argumento que ya vale para
-- `erp.stock_movements` (101) y `erp.cash_movements`/`account_movements`
-- (106/107): el historial de decisiones de acceso es en sí mismo un dato de
-- auditoría, no un detalle interno. `revoked_at IS NULL` es "vigente", igual
-- que `voided_at IS NULL` en esas tablas.
--
-- POR QUÉ SE REEMPLAZA `erp.has_access(UUID, TEXT)` EN VEZ DE EDITAR LA 104.
-- Las migraciones son append-only (100:1-10, repetido en 110). El overload de
-- dos argumentos que la 104 definió consultaba `erp.module_grants` sin mirar
-- si la fila seguía vigente: agregar `revoked_at` sin tocar la función haría
-- que revocar no revocara nada — la fila seguiría existiendo y el `EXISTS`
-- la seguiría encontrando. Ese es el bug que esta migración existe para no
-- introducir.
-- ============================================================================

ALTER TABLE erp.module_grants
  ADD COLUMN revoked_at TIMESTAMPTZ,
  ADD COLUMN revoked_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL;

-- Índice sobre el FK nuevo, mismo criterio que el resto de la tabla
-- (104_erp_permisos.sql:56).
CREATE INDEX idx_erp_module_grants_revoked_by ON erp.module_grants(revoked_by);

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
           AND g.revoked_at IS NULL
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, erp;

COMMENT ON FUNCTION erp.has_access(UUID, TEXT) IS
  'Puerta del ERP con permiso por módulo. Stock y Ventas quedan abiertos para '
  'todo miembro Premium; el resto requiere ser titular o tener una fila '
  'vigente (revoked_at IS NULL) en erp.module_grants (111). El overload de un '
  'argumento (100) sigue intacto.';

-- ----------------------------------------------------------------------------
-- Re-otorgar después de revocar.
--
-- `UNIQUE(institution_id, professional_id, module)` (104) sigue vigente y es
-- correcto que lo esté: un permiso no tiene dos filas. Volver a otorgar un
-- permiso revocado NO es un INSERT — chocaría contra ese índice único, porque
-- la fila revocada sigue ahí — es un UPDATE que limpia `revoked_at` y anota
-- quién otorgó de nuevo. La política de UPDATE ya existente (104:117-119) ya
-- lo permite para el titular; lo único que faltaba era que la aplicación (la
-- pantalla de Equipo, `team-actions.ts`) supiera hacer UPDATE en vez de
-- INSERT cuando la fila ya existe.
--
-- Nada que agregar en SQL para esto — se deja documentado acá porque es la
-- razón de ser de esta migración tanto como el `revoked_at` mismo, y quien
-- lea el schema sin leer `team-actions.ts` tiene que poder reconstruir la
-- decisión.
-- ----------------------------------------------------------------------------
