-- ============================================================================
-- PetCloud ERP — Migración 116: catálogo compartido de productos (sustrato)
--
-- Cambio: erp-catalogo-compartido (fase 1 de 4). Agrega un catálogo de
-- productos cruzado entre instituciones, sin `institution_id`: excepción
-- documentada a la regla 1 del ERP (README, sección "Las tres reglas propias
-- del ERP"). Ninguna tabla por institución gana FK hacia este catálogo, así
-- que `erp.fks_internas()` (112) no lo ve y la regla 2 no se ve afectada.
--
-- Contenido de esta migración:
--   1. `erp.normalize_gtin(text)` — identidad del código de barras (GTIN-14).
--   2. `erp.catalog_products` — los hechos del producto (sin datos de
--      inquilino: sin precio, sin stock, sin proveedor).
--   3. `erp.catalog_barcodes` — códigos alias, uno o más por entrada.
--   4. RLS: lectura para cualquier institución con acceso al ERP, alta para
--      cualquiera, corrección solo para `is_platform_admin()`/`service_role`.
--   5. `erp.catalog_add(...)` — RPC `SECURITY INVOKER` que hace el alta
--      atómica y libre de carrera entre las dos tablas.
--   6. `erp.products` gana `presentation` y `laboratory`, nullable — para que
--      el autofill de la fase 4 tenga dónde persistir lo que prellena.
--
-- PRE-VUELO ANTES DE APLICAR A PRODUCCIÓN (maintainer-only, `[BLOCKED -
-- maintainer]` en tasks.md 1.10). Las tres consultas deben confirmar que este
-- cambio es puramente aditivo:
--
--   -- 1. Ninguna fila existente de `erp.products` se ve afectada (columnas
--   --    nuevas, nullable, sin default distinto de NULL):
--   SELECT count(*) FROM erp.products; -- informativo, no debe fallar
--
--   -- 2. Las columnas nuevas nacen todas NULL (no hay backfill):
--   SELECT count(*) FROM erp.products
--    WHERE presentation IS NOT NULL OR laboratory IS NOT NULL;
--   -- Se espera 0: recién creadas, nadie las llenó todavía.
--
--   -- 3. Ninguna FK existente cambia de forma (no hay ALTER sobre una FK ya
--   --    aplicada; la única FK nueva es catalog_barcodes → catalog_products,
--   --    interna a esta migración):
--   SELECT conname, conrelid::regclass, confrelid::regclass
--     FROM pg_constraint
--    WHERE contype = 'f' AND connamespace = 'erp'::regnamespace
--    ORDER BY conname;
--   -- Comparar contra el resultado antes de aplicar: debe ser el mismo
--   -- conjunto más "catalog_barcodes_catalog_product_id_fkey".
--
-- Mergear a `master` aplica esta migración a producción automáticamente
-- (docs/desarrollo/trampas-conocidas.md, "El check de Vercel..."); el pre-vuelo
-- se corre ANTES de ese merge, no después.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Identidad del código de barras: GTIN-14
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION erp.normalize_gtin(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = erp, public AS $$
DECLARE
  v TEXT := btrim(p_code);
  s INT := 0;
  i INT;
BEGIN
  IF v IS NULL OR v !~ '^[0-9]+$' OR length(v) NOT IN (8, 12, 13, 14) THEN
    RETURN NULL;
  END IF;
  v := lpad(v, 14, '0');
  -- Mod-10 de GS1: desde la derecha, sin contar el dígito verificador,
  -- pesos 3,1,3,1…
  FOR i IN 1..13 LOOP
    s := s + substr(v, i, 1)::INT * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END;
  END LOOP;
  IF (10 - s % 10) % 10 <> substr(v, 14, 1)::INT THEN
    RETURN NULL;
  END IF;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION erp.normalize_gtin(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION erp.normalize_gtin(TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2 y 3. Tablas del catálogo
-- ----------------------------------------------------------------------------

CREATE TABLE erp.catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_gtin TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  species TEXT CHECK (species IN ('dog', 'cat', 'fish', 'bird', 'small_mammal',
                                   'reptile_amphibian', 'other')),
  product_type TEXT NOT NULL CHECK (product_type IN ('food', 'treats', 'pharmacy',
    'health', 'hygiene', 'accessories', 'toys', 'clothing', 'walking', 'litter',
    'aquarium', 'beds_housing', 'other')),
  source_cat1 TEXT,
  source_cat2 TEXT,
  presentation TEXT CHECK (length(presentation) <= 120),
  laboratory TEXT CHECK (length(laboratory) <= 120),
  -- Solo trazabilidad: nunca se lee desde RLS ni da ningún derecho al creador
  -- (proposal.md, "Creator"). Filas del seed nacen con las dos en NULL.
  created_by_institution_id UUID REFERENCES public.vet_institutions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (primary_gtin = erp.normalize_gtin(primary_gtin))
);

COMMENT ON TABLE erp.catalog_products IS
  'Catálogo global de productos, sin institution_id (excepción documentada '
  'a la regla 1 del README del ERP). Alta libre, edición solo admin/service_role.';

CREATE TABLE erp.catalog_barcodes (
  gtin TEXT PRIMARY KEY CHECK (gtin = erp.normalize_gtin(gtin)),
  catalog_product_id UUID NOT NULL
    REFERENCES erp.catalog_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX catalog_barcodes_product_idx ON erp.catalog_barcodes(catalog_product_id);

COMMENT ON TABLE erp.catalog_barcodes IS
  'Todo GTIN de una entrada del catálogo, incluido el primario, vive acá. '
  'La PK sobre gtin es la única garantía de unicidad global: un GTIN no '
  'puede pertenecer a dos entradas.';

-- Reutiliza el trigger de updated_at existente (público, ya usado por la 101
-- sobre erp.products).
CREATE TRIGGER catalog_products_updated_at
  BEFORE UPDATE ON erp.catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Permisos y RLS
-- ----------------------------------------------------------------------------

GRANT SELECT, INSERT ON erp.catalog_products, erp.catalog_barcodes TO authenticated;
-- No es estrictamente necesario (103 ya le da ALL a service_role por default
-- privileges sobre toda tabla nueva del schema erp), pero se deja explícito
-- para que esta migración se lea completa sin tener que recordar la 103.
GRANT ALL ON erp.catalog_products, erp.catalog_barcodes TO service_role;
-- Otorgado también a `authenticated`: es el único camino para que el admin
-- de plataforma (una cuenta `authenticated` común) pueda corregir una
-- entrada. Las políticas de abajo son las que niegan a todos los demás.
GRANT UPDATE, DELETE ON erp.catalog_products, erp.catalog_barcodes TO authenticated;

ALTER TABLE erp.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.catalog_barcodes ENABLE ROW LEVEL SECURITY;
-- Sin FORCE ROW LEVEL SECURITY: no se usa en ningún otro lugar de este
-- schema; service_role sigue salteando RLS como siempre (ese es el camino
-- del admin/seed).

CREATE POLICY catalog_products_select ON erp.catalog_products FOR SELECT
  USING (erp.has_access(erp.my_institution_id()) OR public.is_platform_admin());

CREATE POLICY catalog_products_insert ON erp.catalog_products FOR INSERT
  WITH CHECK (erp.has_access(erp.my_institution_id())
              AND created_by = auth.uid()
              AND created_by_institution_id = erp.my_institution_id());

CREATE POLICY catalog_products_admin_update ON erp.catalog_products FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY catalog_products_admin_delete ON erp.catalog_products FOR DELETE
  USING (public.is_platform_admin());

CREATE POLICY catalog_barcodes_select ON erp.catalog_barcodes FOR SELECT
  USING (erp.has_access(erp.my_institution_id()) OR public.is_platform_admin());

-- La entrada padre tiene que ser visible (RLS-filtrada) para poder insertarle
-- un alias: mismo criterio que la política de SELECT de arriba.
CREATE POLICY catalog_barcodes_insert ON erp.catalog_barcodes FOR INSERT
  WITH CHECK (
    (erp.has_access(erp.my_institution_id()) OR public.is_platform_admin())
    AND EXISTS (
      SELECT 1 FROM erp.catalog_products cp WHERE cp.id = catalog_product_id
    )
  );

CREATE POLICY catalog_barcodes_admin_update ON erp.catalog_barcodes FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY catalog_barcodes_admin_delete ON erp.catalog_barcodes FOR DELETE
  USING (public.is_platform_admin());

-- ----------------------------------------------------------------------------
-- 5. Alta atómica, libre de carrera: erp.catalog_add
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION erp.catalog_add(
  p_gtin TEXT,
  p_name TEXT,
  p_species TEXT,
  p_product_type TEXT,
  p_presentation TEXT DEFAULT NULL,
  p_laboratory TEXT DEFAULT NULL
) RETURNS erp.catalog_products
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = erp, public AS $$
DECLARE
  v_gtin TEXT;
  v_institution_id UUID;
  v_entry erp.catalog_products;
  v_new_id UUID;
  v_barcode_gtin TEXT;
BEGIN
  v_gtin := erp.normalize_gtin(p_gtin);
  IF v_gtin IS NULL THEN
    RAISE EXCEPTION 'invalid_parameter_value: % no es un GTIN válido', p_gtin
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_institution_id := erp.my_institution_id();

  -- 1. Ya existe: devolverla tal cual, sin tocar nada.
  SELECT cp.* INTO v_entry
    FROM erp.catalog_products cp
    JOIN erp.catalog_barcodes cb ON cb.catalog_product_id = cp.id
   WHERE cb.gtin = v_gtin;

  IF FOUND THEN
    RETURN v_entry;
  END IF;

  -- 2. No existe todavía: insertar entrada + código en un savepoint, para
  -- poder deshacer solo la entrada si el código pierde la carrera (D4:
  -- ninguna de las dos tablas tiene DELETE para authenticated, así que el
  -- savepoint es la única forma de no dejar una entrada huérfana).
  v_new_id := gen_random_uuid();

  BEGIN
    INSERT INTO erp.catalog_products (
      id, primary_gtin, name, species, product_type,
      presentation, laboratory, created_by, created_by_institution_id
    ) VALUES (
      v_new_id, v_gtin, p_name, p_species, p_product_type,
      p_presentation, p_laboratory, auth.uid(), v_institution_id
    );

    INSERT INTO erp.catalog_barcodes (gtin, catalog_product_id)
    VALUES (v_gtin, v_new_id)
    ON CONFLICT (gtin) DO NOTHING
    RETURNING gtin INTO v_barcode_gtin;

    IF v_barcode_gtin IS NULL THEN
      -- Perdimos la carrera: alguien más insertó este GTIN entre el SELECT
      -- de arriba y este INSERT. Deshacemos nuestra entrada.
      RAISE EXCEPTION 'catalog_add_race_lost' USING ERRCODE = 'P0001';
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    -- Deshace solo el INSERT de esta transacción (la entrada huérfana);
    -- no afecta la fila ganadora, que vive en otra transacción ya committeada.
    NULL;
  END;

  -- 3. Releer: si ganamos, es la que acabamos de insertar; si perdimos, es
  -- la del otro caller. Cualquiera de los dos casos, mismo camino de vuelta.
  SELECT cp.* INTO v_entry
    FROM erp.catalog_products cp
    JOIN erp.catalog_barcodes cb ON cb.catalog_product_id = cp.id
   WHERE cb.gtin = v_gtin;

  RETURN v_entry;
END $$;

REVOKE EXECUTE ON FUNCTION erp.catalog_add(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION erp.catalog_add(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. erp.products gana presentation/laboratory (autofill, fase 4)
-- ----------------------------------------------------------------------------

ALTER TABLE erp.products
  ADD COLUMN presentation TEXT CHECK (length(presentation) <= 120),
  ADD COLUMN laboratory TEXT CHECK (length(laboratory) <= 120);

COMMENT ON COLUMN erp.products.presentation IS
  'Nullable. Prellenada desde erp.catalog_products en el alta (fase 4), '
  'editable como cualquier otro campo del producto de la institución.';
COMMENT ON COLUMN erp.products.laboratory IS
  'Nullable. Misma procedencia que presentation.';
