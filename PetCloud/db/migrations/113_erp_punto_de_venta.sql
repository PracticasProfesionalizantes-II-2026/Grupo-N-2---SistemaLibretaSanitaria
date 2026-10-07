-- ============================================================================
-- PetCloud ERP — Migración 113: costo congelado en la venta, y códigos de
-- barras por producto
--
-- DOS PROBLEMAS DISTINTOS, UNA SOLA MIGRACIÓN porque comparten el mismo punto
-- de escritura (`erp.register_sale()`), y una `113` a medias dejaría esa
-- función en desacuerdo con su propia tabla:
--
--   1. `erp.sale_items` no guarda costo. `erp.products.cost_cents` es el costo
--      de la ÚLTIMA compra, y `erp.register_purchase()` (105:207-209) lo
--      pisa sin condición cada vez que entra mercadería. Sin congelar, un
--      reporte de margen recalcularía el margen de TODAS las ventas pasadas
--      cada vez que alguien registra una compra — una historia que se
--      reescribe sola no es una historia. `purchase_items` ya congela su
--      costo (105); las ventas no espejaban el mismo criterio del propio
--      módulo.
--   2. `erp.products` no tiene código de barras. Agregar una línea a una
--      venta significa abrir un `<select>` y elegir del catálogo — no hay
--      forma de escanear.
--
-- LA FUNCIÓN QUE SE REEMPLAZA ACÁ ABAJO ES LA DE LA 108, NO LA DE LA 112.
-- La 112 (112:439-455) deliberadamente NO copió el cuerpo de
-- `erp.register_sale()`: solo agregó un trigger `BEFORE INSERT` que deriva
-- `sale_items.institution_id` cuando el INSERT no la trae. El cuerpo real —el
-- único que existió hasta hoy— sigue siendo el de la 108 (108:269-456). Se
-- copia acá VERBATIM, más el cambio puntual de la Decisión 2 de design.md.
-- Queda pegado completo un poco más abajo, en el bloque de ROLLBACK, para que
-- una futura `114` no tenga que reconstruirlo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Costo congelado en la línea de venta
--
-- Nullable a propósito: las filas anteriores a esta migración, y las de un
-- producto que nunca se compró, no tienen costo conocido. `NULL` significa
-- "desconocido" y un reporte tiene que decirlo así — nunca leerlo como cero,
-- que fabricaría un 100% de margen falso.
-- ----------------------------------------------------------------------------
ALTER TABLE erp.sale_items
  ADD COLUMN unit_cost_cents BIGINT
    CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0);

COMMENT ON COLUMN erp.sale_items.unit_cost_cents IS
  'Costo congelado al momento de vender. NULL = desconocido, nunca cero. '
  'Única fuente de costo para margen: stock_movements.unit_cost_cents sigue '
  'siendo NULL en las ventas (Decisión 3 de design.md) y no se lee para '
  'esto.';

-- ----------------------------------------------------------------------------
-- 2 · erp.product_barcodes — varios códigos por producto, únicos por
-- institución
--
-- `code` es TEXT plano, sin FK a ningún catálogo: matchear un código con un
-- producto pasa por comparar el VALOR, nunca siguiendo una referencia. Así
-- una futura tabla catálogo global puede prefillear estas filas más adelante
-- sin ninguna migración de datos — el constraint de la propuesta
-- (proposal.md, "The constraint the future global catalogue imposes").
--
-- FK compuesta sobre `(product_id, institution_id)` — regla 2 de
-- src/features/erp/README.md. `erp.products` ya tiene `UNIQUE (id,
-- institution_id)` desde la 112, así que el padre no necesita cambios.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.product_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL
    REFERENCES public.vet_institutions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (product_id, institution_id)
    REFERENCES erp.products(id, institution_id) ON DELETE CASCADE,

  -- Únicos por institución, nunca global: dos veterinarias distintas pueden
  -- legítimamente usar el mismo código para productos propios distintos.
  UNIQUE (institution_id, code)
);

CREATE INDEX idx_erp_product_barcodes_institution
  ON erp.product_barcodes(institution_id);
CREATE INDEX idx_erp_product_barcodes_product
  ON erp.product_barcodes(product_id, institution_id);

-- Solo SELECT/INSERT/DELETE, sin UPDATE ni `updated_at`: un código se
-- reemplaza con DELETE + INSERT, lo que mantiene trivial el `UNIQUE
-- (institution_id, code)`.
--
-- El DELETE va contra la regla 3 de src/features/erp/README.md ("nada se
-- borra"), y es una excepción deliberada: esa regla protege trazabilidad
-- contable (un movimiento, una venta, un asiento de caja). Un código de
-- barras es un identificador, no un asiento — borrar uno mal tipeado no
-- destruye ninguna historia, porque la línea de venta que ya usó ese
-- producto congeló su `product_id`, precio y costo por su cuenta.
GRANT SELECT, INSERT, DELETE ON erp.product_barcodes TO authenticated;
ALTER TABLE erp.product_barcodes ENABLE ROW LEVEL SECURITY;

-- Plantilla de la 100 (rule 1 de src/features/erp/README.md), sin gate de
-- módulo: los códigos de barras son parte de Stock y Ventas por igual, y
-- todo miembro Premium ya tiene acceso a los dos desde el día uno (108).
CREATE POLICY "product_barcodes_select" ON erp.product_barcodes FOR SELECT
  USING (erp.has_access(institution_id));

CREATE POLICY "product_barcodes_insert" ON erp.product_barcodes FOR INSERT
  WITH CHECK (erp.has_access(institution_id));

CREATE POLICY "product_barcodes_delete" ON erp.product_barcodes FOR DELETE
  USING (erp.has_access(institution_id));

-- ----------------------------------------------------------------------------
-- 3 · erp.register_sale(JSONB) — cuerpo de la 108, más la lectura de costo
--
-- Único cambio real contra la 108: el `IF NOT EXISTS` que comprobaba la
-- pertenencia del producto (108:389-396) se convierte en el propio `SELECT`
-- que lee `cost_cents` — la comprobación de pertenencia queda intacta como
-- efecto secundario del `IF NOT FOUND`, y la lectura no cuesta un segundo
-- viaje a la tabla (design.md, Decisión 2).
--
-- El resto del cuerpo —ruteo de pago, orden de locks, snapshot fiscal— es
-- literal de la 108. No se toca nada más.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.register_sale(p_payload JSONB)
RETURNS UUID AS $$
DECLARE
  v_institution_id UUID;
  v_professional_id UUID;
  v_customer_id UUID;
  v_payment_method TEXT;
  v_sale_id UUID;
  v_total_cents BIGINT := 0;
  v_item JSONB;
  v_line_total BIGINT;
  v_fiscal_snapshot JSONB;
  v_posts_cash BOOLEAN;
  v_posts_account BOOLEAN;
  v_account_id UUID;
  v_unit_cost_cents BIGINT;
BEGIN
  v_institution_id := erp.my_institution_id();

  IF NOT erp.has_access(v_institution_id, 'ventas') THEN
    RAISE EXCEPTION 'Sin acceso a Ventas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_payment_method := p_payload ->> 'payment_method';
  v_customer_id := NULLIF(p_payload ->> 'customer_id', '')::UUID;

  IF v_payment_method IS NOT NULL AND v_customer_id IS NULL AND EXISTS (
    SELECT 1 FROM erp.payment_methods
     WHERE code = v_payment_method AND requires_customer
  ) THEN
    RAISE EXCEPTION 'Una venta en cuenta corriente necesita un cliente identificado'
      USING ERRCODE = 'ERP03';
  END IF;

  IF jsonb_array_length(p_payload -> 'items') = 0 THEN
    RAISE EXCEPTION 'Una venta necesita al menos una línea'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_payment_method := p_payload ->> 'payment_method';
  v_customer_id := NULLIF(p_payload ->> 'customer_id', '')::UUID;

  SELECT posts_cash, posts_account INTO v_posts_cash, v_posts_account
    FROM erp.payment_methods
   WHERE code = v_payment_method
     AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El método de pago no existe o no está activo'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM erp.customers
     WHERE id = v_customer_id
       AND institution_id = v_institution_id
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece a esta institución'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_customer_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'razon_social', razon_social,
             'tipo_documento', tipo_documento,
             'numero_documento', numero_documento,
             'condicion_iva', condicion_iva
           )
      INTO v_fiscal_snapshot
      FROM erp.customers
     WHERE id = v_customer_id;
  END IF;

  v_professional_id := public.my_vet_professional_id();

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload -> 'items')
  LOOP
    v_total_cents := v_total_cents
      + (v_item ->> 'quantity')::NUMERIC * (v_item ->> 'unit_price_cents')::BIGINT;
  END LOOP;

  INSERT INTO erp.sales (
    institution_id, customer_id, payment_method, fiscal_snapshot,
    total_cents, created_by
  ) VALUES (
    v_institution_id, v_customer_id, v_payment_method, v_fiscal_snapshot,
    v_total_cents, v_professional_id
  )
  RETURNING id INTO v_sale_id;

  -- Líneas ordenadas por `product_id` ASC — orden fijo de locks (108, design.md).
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_payload -> 'items')
     ORDER BY (value ->> 'product_id')::UUID ASC
  LOOP
    -- El `IF NOT EXISTS` de la 108 se vuelve la propia lectura de costo: el
    -- producto tiene que ser de esta institución, o la venta descontaría
    -- stock de un catálogo ajeno (mismo rechazo que la 108), y de paso se lee
    -- el costo a congelar en esta línea (design.md, Decisión 2).
    SELECT cost_cents INTO v_unit_cost_cents
      FROM erp.products
     WHERE id = (v_item ->> 'product_id')::UUID
       AND institution_id = v_institution_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto no pertenece a esta institución'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_line_total := (v_item ->> 'quantity')::NUMERIC * (v_item ->> 'unit_price_cents')::BIGINT;

    -- `cost_cents` es `NOT NULL DEFAULT 0` (101:55): "nunca comprado" y
    -- "cuesta cero" son el mismo valor ahí. `NULLIF(v_unit_cost_cents, 0)`
    -- guarda `NULL` — desconocido, nunca un margen falso del 100%. Un
    -- regalo genuinamente gratis también queda como `NULL`; se acepta:
    -- "desconocido" es honesto y los regalos son la excepción, no la regla.
    INSERT INTO erp.sale_items (
      sale_id, product_id, quantity, unit_price_cents, unit_cost_cents
    )
    VALUES (
      v_sale_id,
      (v_item ->> 'product_id')::UUID,
      (v_item ->> 'quantity')::NUMERIC,
      (v_item ->> 'unit_price_cents')::BIGINT,
      NULLIF(v_unit_cost_cents, 0)
    );

    -- Salida de stock. `unit_cost_cents` sigue en NULL a propósito
    -- (design.md, Decisión 3): esta columna, en este movimiento, siempre
    -- significó el costo de una ENTRADA; una venta es un evento de precio,
    -- no de costeo. La única fuente de costo para margen es
    -- `sale_items.unit_cost_cents`, arriba.
    INSERT INTO erp.stock_movements (
      institution_id, product_id, kind, quantity, unit_cost_cents,
      note, created_by
    ) VALUES (
      v_institution_id,
      (v_item ->> 'product_id')::UUID,
      'sale',
      -(v_item ->> 'quantity')::NUMERIC,
      NULL,
      'Venta ' || v_sale_id,
      v_professional_id
    );
  END LOOP;

  IF v_posts_cash THEN
    INSERT INTO erp.cash_accounts (institution_id)
    VALUES (v_institution_id)
    ON CONFLICT (institution_id) DO NOTHING;

    SELECT id INTO v_account_id
      FROM erp.cash_accounts
     WHERE institution_id = v_institution_id;

    INSERT INTO erp.cash_movements (
      institution_id, cash_account_id, sale_id, kind, amount_cents,
      note, created_by
    ) VALUES (
      v_institution_id, v_account_id, v_sale_id, 'sale', v_total_cents,
      'Venta ' || v_sale_id, v_professional_id
    );
  ELSIF v_posts_account THEN
    INSERT INTO erp.account_movements (
      institution_id, customer_id, sale_id, kind, amount_cents,
      note, created_by
    ) VALUES (
      v_institution_id, v_customer_id, v_sale_id, 'sale', v_total_cents,
      'Venta ' || v_sale_id, v_professional_id
    );
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.register_sale(JSONB) IS
  'Inserta el documento de venta, sus líneas (con costo congelado en '
  'sale_items.unit_cost_cents), un movimiento de stock por línea '
  '(kind=sale) y exactamente un movimiento de cobro (cash o account, según '
  'erp.payment_methods). Una transacción. Exige '
  'erp.has_access(institution_id, ''ventas'').';

REVOKE EXECUTE ON FUNCTION erp.register_sale(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION erp.register_sale(JSONB) TO authenticated;

-- ============================================================================
-- ROLLBACK
--
-- Migraciones append-only: revertir es una `114` nueva, nunca una edición de
-- este archivo.
--
--   1. `DROP TABLE erp.product_barcodes;`
--   2. `ALTER TABLE erp.sale_items DROP COLUMN unit_cost_cents;`
--   3. Restaurar el cuerpo de `erp.register_sale()` a la versión de la 108
--      (NO a la de esta 113), pegado abajo verbatim para que una `114` no
--      tenga que ir a buscarlo a un commit viejo:
--
-- CREATE OR REPLACE FUNCTION erp.register_sale(p_payload JSONB)
-- RETURNS UUID AS $$
-- DECLARE
--   v_institution_id UUID;
--   v_professional_id UUID;
--   v_customer_id UUID;
--   v_payment_method TEXT;
--   v_sale_id UUID;
--   v_total_cents BIGINT := 0;
--   v_item JSONB;
--   v_line_total BIGINT;
--   v_fiscal_snapshot JSONB;
--   v_posts_cash BOOLEAN;
--   v_posts_account BOOLEAN;
--   v_account_id UUID;
-- BEGIN
--   v_institution_id := erp.my_institution_id();
--
--   IF NOT erp.has_access(v_institution_id, 'ventas') THEN
--     RAISE EXCEPTION 'Sin acceso a Ventas' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   v_payment_method := p_payload ->> 'payment_method';
--   v_customer_id := NULLIF(p_payload ->> 'customer_id', '')::UUID;
--
--   IF v_payment_method IS NOT NULL AND v_customer_id IS NULL AND EXISTS (
--     SELECT 1 FROM erp.payment_methods
--      WHERE code = v_payment_method AND requires_customer
--   ) THEN
--     RAISE EXCEPTION 'Una venta en cuenta corriente necesita un cliente identificado'
--       USING ERRCODE = 'ERP03';
--   END IF;
--
--   IF jsonb_array_length(p_payload -> 'items') = 0 THEN
--     RAISE EXCEPTION 'Una venta necesita al menos una línea'
--       USING ERRCODE = 'invalid_parameter_value';
--   END IF;
--
--   v_payment_method := p_payload ->> 'payment_method';
--   v_customer_id := NULLIF(p_payload ->> 'customer_id', '')::UUID;
--
--   SELECT posts_cash, posts_account INTO v_posts_cash, v_posts_account
--     FROM erp.payment_methods
--    WHERE code = v_payment_method
--      AND active;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'El método de pago no existe o no está activo'
--       USING ERRCODE = 'invalid_parameter_value';
--   END IF;
--
--   IF v_customer_id IS NOT NULL AND NOT EXISTS (
--     SELECT 1 FROM erp.customers
--      WHERE id = v_customer_id
--        AND institution_id = v_institution_id
--   ) THEN
--     RAISE EXCEPTION 'El cliente no pertenece a esta institución'
--       USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_customer_id IS NOT NULL THEN
--     SELECT jsonb_build_object(
--              'razon_social', razon_social,
--              'tipo_documento', tipo_documento,
--              'numero_documento', numero_documento,
--              'condicion_iva', condicion_iva
--            )
--       INTO v_fiscal_snapshot
--       FROM erp.customers
--      WHERE id = v_customer_id;
--   END IF;
--
--   v_professional_id := public.my_vet_professional_id();
--
--   FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload -> 'items')
--   LOOP
--     v_total_cents := v_total_cents
--       + (v_item ->> 'quantity')::NUMERIC * (v_item ->> 'unit_price_cents')::BIGINT;
--   END LOOP;
--
--   INSERT INTO erp.sales (
--     institution_id, customer_id, payment_method, fiscal_snapshot,
--     total_cents, created_by
--   ) VALUES (
--     v_institution_id, v_customer_id, v_payment_method, v_fiscal_snapshot,
--     v_total_cents, v_professional_id
--   )
--   RETURNING id INTO v_sale_id;
--
--   FOR v_item IN
--     SELECT value FROM jsonb_array_elements(p_payload -> 'items')
--      ORDER BY (value ->> 'product_id')::UUID ASC
--   LOOP
--     IF NOT EXISTS (
--       SELECT 1 FROM erp.products
--        WHERE id = (v_item ->> 'product_id')::UUID
--          AND institution_id = v_institution_id
--     ) THEN
--       RAISE EXCEPTION 'El producto no pertenece a esta institución'
--         USING ERRCODE = 'insufficient_privilege';
--     END IF;
--
--     v_line_total := (v_item ->> 'quantity')::NUMERIC * (v_item ->> 'unit_price_cents')::BIGINT;
--
--     INSERT INTO erp.sale_items (sale_id, product_id, quantity, unit_price_cents)
--     VALUES (
--       v_sale_id,
--       (v_item ->> 'product_id')::UUID,
--       (v_item ->> 'quantity')::NUMERIC,
--       (v_item ->> 'unit_price_cents')::BIGINT
--     );
--
--     INSERT INTO erp.stock_movements (
--       institution_id, product_id, kind, quantity, unit_cost_cents,
--       note, created_by
--     ) VALUES (
--       v_institution_id,
--       (v_item ->> 'product_id')::UUID,
--       'sale',
--       -(v_item ->> 'quantity')::NUMERIC,
--       NULL,
--       'Venta ' || v_sale_id,
--       v_professional_id
--     );
--   END LOOP;
--
--   IF v_posts_cash THEN
--     INSERT INTO erp.cash_accounts (institution_id)
--     VALUES (v_institution_id)
--     ON CONFLICT (institution_id) DO NOTHING;
--
--     SELECT id INTO v_account_id
--       FROM erp.cash_accounts
--      WHERE institution_id = v_institution_id;
--
--     INSERT INTO erp.cash_movements (
--       institution_id, cash_account_id, sale_id, kind, amount_cents,
--       note, created_by
--     ) VALUES (
--       v_institution_id, v_account_id, v_sale_id, 'sale', v_total_cents,
--       'Venta ' || v_sale_id, v_professional_id
--     );
--   ELSIF v_posts_account THEN
--     INSERT INTO erp.account_movements (
--       institution_id, customer_id, sale_id, kind, amount_cents,
--       note, created_by
--     ) VALUES (
--       v_institution_id, v_customer_id, v_sale_id, 'sale', v_total_cents,
--       'Venta ' || v_sale_id, v_professional_id
--     );
--   END IF;
--
--   RETURN v_sale_id;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;
--
-- Rollback antes de deploy: simplemente no aplicar esta `113`.
-- ============================================================================
