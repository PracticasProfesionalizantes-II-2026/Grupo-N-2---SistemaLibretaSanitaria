-- ============================================================================
-- 118 · Las políticas del catálogo evalúan el permiso una vez, no por fila
-- ============================================================================
--
-- POR QUÉ
--
-- Las políticas de la 116 llaman a `erp.has_access(erp.my_institution_id())`
-- y a `public.is_platform_admin()` directamente. Postgres trata eso como una
-- expresión que depende de la fila y la evalúa UNA VEZ POR FILA. Con la tabla
-- vacía no se notaba. Con la semilla de la 117 cargada (14.598 productos),
-- medido en local actuando como un usuario autenticado:
--
--     SELECT count(*) FROM erp.catalog_products;   -- 5.770 ms, Seq Scan
--
-- La búsqueda por código exacto no sufre (va por el índice del PK y evalúa
-- la política sobre una sola fila, ~1 ms), pero cualquier pantalla que
-- recorra el catálogo —buscar por nombre, listar, contar— tardaría segundos,
-- y bajo carga pasa el `statement_timeout` de 8 s del rol `authenticated`.
--
-- LA CORRECCIÓN
--
-- Envolver cada llamada en `(SELECT …)`. Así Postgres la convierte en un
-- InitPlan: se calcula una sola vez por consulta y el resultado se reusa en
-- todas las filas. Ninguna de las funciones depende de la fila —solo de quién
-- consulta—, así que el resultado es idéntico; cambia solo cuándo se calcula.
-- Es el patrón que recomienda la documentación de Supabase para RLS.
--
-- Las políticas se reescriben con las mismas expresiones de la 116. Ninguna
-- regla cambia: agregan las veterinarias con ERP, corrige solo el admin.
--
-- Una sola diferencia, y es a propósito: la 116 las creó sin `TO`, o sea para
-- `public` (todos los roles). Acá van `TO authenticated`. En la práctica no
-- cambia a quién alcanzan —`anon` no tiene ningún GRANT sobre estas tablas y
-- `service_role` saltea RLS—, pero deja escrito para quién son.
--
-- Va en el mismo PR que la 117 a propósito: la 116 ya está en producción con
-- la tabla vacía, y este costo aparece recién cuando llegan los datos.
-- ----------------------------------------------------------------------------

-- catalog_products ------------------------------------------------------------

DROP POLICY IF EXISTS catalog_products_select ON erp.catalog_products;
CREATE POLICY catalog_products_select ON erp.catalog_products
  FOR SELECT TO authenticated
  USING (
    (SELECT erp.has_access((SELECT erp.my_institution_id())))
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS catalog_products_insert ON erp.catalog_products;
CREATE POLICY catalog_products_insert ON erp.catalog_products
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT erp.has_access((SELECT erp.my_institution_id())))
    AND created_by = (SELECT auth.uid())
    AND created_by_institution_id = (SELECT erp.my_institution_id())
  );

DROP POLICY IF EXISTS catalog_products_admin_update ON erp.catalog_products;
CREATE POLICY catalog_products_admin_update ON erp.catalog_products
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS catalog_products_admin_delete ON erp.catalog_products;
CREATE POLICY catalog_products_admin_delete ON erp.catalog_products
  FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- catalog_barcodes ------------------------------------------------------------

DROP POLICY IF EXISTS catalog_barcodes_select ON erp.catalog_barcodes;
CREATE POLICY catalog_barcodes_select ON erp.catalog_barcodes
  FOR SELECT TO authenticated
  USING (
    (SELECT erp.has_access((SELECT erp.my_institution_id())))
    OR (SELECT public.is_platform_admin())
  );

DROP POLICY IF EXISTS catalog_barcodes_insert ON erp.catalog_barcodes;
CREATE POLICY catalog_barcodes_insert ON erp.catalog_barcodes
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      (SELECT erp.has_access((SELECT erp.my_institution_id())))
      OR (SELECT public.is_platform_admin())
    )
    AND EXISTS (
      SELECT 1 FROM erp.catalog_products cp
      WHERE cp.id = catalog_barcodes.catalog_product_id
    )
  );

DROP POLICY IF EXISTS catalog_barcodes_admin_update ON erp.catalog_barcodes;
CREATE POLICY catalog_barcodes_admin_update ON erp.catalog_barcodes
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS catalog_barcodes_admin_delete ON erp.catalog_barcodes;
CREATE POLICY catalog_barcodes_admin_delete ON erp.catalog_barcodes
  FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- ============================================================================
-- ROLLBACK: volver a crear las ocho políticas con el texto de la 116 (mismas
-- expresiones sin el `(SELECT …)`). La lógica es idéntica; solo vuelve el costo.
-- ============================================================================
