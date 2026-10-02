-- ============================================================================
-- PetCloud ERP — Migración 108: ventas
--
-- Quinto módulo de negocio del ERP, y el que cierra el circuito de plata:
-- depende de `erp.stock_movements` (101, con la guarda de la 102),
-- `erp.apply_cash_movement()` (106) y `erp.apply_account_movement()` (107).
-- Una venta es un documento (`erp.sales` + `erp.sale_items`) que **produce**,
-- en una sola transacción, movimientos de stock y exactamente un movimiento
-- de cobro — mismo criterio que `erp.register_purchase()` (105) con el
-- stock, ahora con el libro de cobro sumado.
--
-- LA TRAMPA DE ESTE MÓDULO, dicha en voz alta para que nadie la repita:
-- el método de pago decide A CUÁL libro va la plata, y esa decisión NO puede
-- vivir solo en la aplicación. Si `register_sale()` fuera el único lugar que
-- sabe "efectivo va al cajón, cuenta corriente va a la deuda", el día que
-- alguien escriba otra vía de acceso a `cash_movements` o `account_movements`
-- —un script, una función nueva, un INSERT manual de soporte— nada le impide
-- mandar una venta en cuenta corriente al cajón. Eso rompería el arqueo, que
-- es la razón entera de que Caja tenga su propio libro (106). Por eso el
-- ruteo se repite ACÁ ABAJO como una tabla (`erp.payment_methods`) y se hace
-- cumplir con dos triggers `BEFORE INSERT` sobre los libros mismos, no sobre
-- `erp.sales`. Agregar un método de pago el día de mañana es agregar una
-- fila, nunca una rama de código.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- erp.payment_methods — la tabla de ruteo
--
-- `code` es la clave, no un `id` generado: es un catálogo cerrado y chico,
-- referenciado desde `erp.sales.payment_method`, y usar el código legible
-- como PK evita un JOIN extra en cada lectura del listado de ventas.
--
-- `requires_customer` vive acá y no como un CHECK aparte en `erp.sales`
-- porque la condición depende del MÉTODO, no de la venta: es exactamente el
-- mismo razonamiento que `posts_cash`/`posts_account`.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.payment_methods (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,

  posts_cash BOOLEAN NOT NULL DEFAULT false,
  posts_account BOOLEAN NOT NULL DEFAULT false,
  requires_customer BOOLEAN NOT NULL DEFAULT false,

  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO erp.payment_methods (code, label, posts_cash, posts_account, requires_customer) VALUES
  ('efectivo', 'Efectivo', true, false, false),
  ('tarjeta', 'Tarjeta', false, false, false),
  ('transferencia', 'Transferencia', false, false, false),
  ('cuenta_corriente', 'Cuenta corriente', false, true, true);

-- ----------------------------------------------------------------------------
-- erp.sales — el documento
--
-- `fiscal_snapshot` congela los campos fiscales del cliente (razón social,
-- documento, condición de IVA) al momento de la venta — el requerimiento
-- pendiente de `erp-customers` ("sale documents freeze a fiscal snapshot").
-- Sin esto, una venta de hace seis meses cambiaría de condición de IVA si
-- alguien corrige el dato del cliente hoy, y ese es exactamente el problema
-- que `unit_cost_cents` en `stock_movements` (101) ya resolvió del lado del
-- costo: la historia no se reescribe sola.
--
-- `customer_id` es NULLABLE: `consumidor final` (sin cliente identificado) es
-- el default para efectivo y tarjeta. Solo `cuenta_corriente` lo exige, y esa
-- exigencia la hace el trigger de `account_movements` de más abajo — no un
-- `NOT NULL` acá, que bloquearía también las ventas que no lo necesitan.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES erp.customers(id) ON DELETE RESTRICT,

  payment_method TEXT NOT NULL REFERENCES erp.payment_methods(code),

  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'voided')),

  -- Congelado al momento de la venta. NULL cuando no hay cliente identificado
  -- (consumidor final): no hay nada que congelar.
  fiscal_snapshot JSONB,

  total_cents BIGINT NOT NULL CHECK (total_cents >= 0),

  created_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_sales_institution ON erp.sales(institution_id);
CREATE INDEX idx_erp_sales_customer ON erp.sales(customer_id);
CREATE INDEX idx_erp_sales_payment_method ON erp.sales(payment_method);
CREATE INDEX idx_erp_sales_created_by ON erp.sales(created_by);

-- ----------------------------------------------------------------------------
-- erp.sale_items — las líneas
--
-- `unit_price_cents` es el precio congelado de la línea, mismo criterio que
-- `purchase_items.unit_cost_cents` (105): el total de una venta de hace un
-- año no cambia porque el precio de lista de hoy sea otro.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES erp.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES erp.products(id) ON DELETE RESTRICT,

  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_sale_items_sale ON erp.sale_items(sale_id);
CREATE INDEX idx_erp_sale_items_product ON erp.sale_items(product_id);

-- ----------------------------------------------------------------------------
-- `cash_movements.sale_id` / `account_movements.sale_id` — la FK diferida
--
-- Las columnas ya existían sin referencia (106:83-87, 107:127-128) porque
-- `erp.sales` no existía todavía. Ahora que existe, se agrega la FK — mismo
-- criterio de "dejar el lugar preparado" que motivó crear la columna antes de
-- tener a qué apuntar.
-- ----------------------------------------------------------------------------
ALTER TABLE erp.cash_movements
  ADD CONSTRAINT cash_movements_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES erp.sales(id) ON DELETE RESTRICT;

ALTER TABLE erp.account_movements
  ADD CONSTRAINT account_movements_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES erp.sales(id) ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- erp.enforce_cash_movement_routing — el guardián del cajón
--
-- `BEFORE INSERT` y no una restricción en `erp.sales`: la venta ya sabe qué
-- método usó (columna `payment_method`, con su propio FK a
-- `payment_methods`); lo que este trigger impide es que un movimiento de
-- CAJA se cree para una venta cuyo método NO postea a caja. Es la guarda
-- contra el riesgo más alto de todo el cambio (design.md, decisión "payment
-- routing is a table, enforced ledger-side"): una venta en cuenta corriente
-- que de todas formas termina en `cash_movements` rompería el arqueo, que
-- es la razón entera de que Caja tenga su propio libro (106).
--
-- Solo mira movimientos CON `sale_id`: un aporte, un retiro o un arqueo no
-- vienen de una venta y no tienen método de pago que verificar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.enforce_cash_movement_routing()
RETURNS TRIGGER AS $$
DECLARE
  v_posts_cash BOOLEAN;
BEGIN
  IF NEW.sale_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pm.posts_cash INTO v_posts_cash
    FROM erp.sales s
    JOIN erp.payment_methods pm ON pm.code = s.payment_method
   WHERE s.id = NEW.sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La venta no existe' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_posts_cash THEN
    RAISE EXCEPTION
      'Esa venta no se paga en efectivo: no puede generar un movimiento de caja'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.enforce_cash_movement_routing() IS
  'Rechaza un movimiento de caja ligado a una venta cuyo método de pago no '
  'tiene posts_cash. Guarda contra el riesgo más alto del cambio: cuenta '
  'corriente llegando al cajón y rompiendo el arqueo.';

CREATE TRIGGER erp_cash_movements_routing
  BEFORE INSERT ON erp.cash_movements
  FOR EACH ROW EXECUTE FUNCTION erp.enforce_cash_movement_routing();

-- ----------------------------------------------------------------------------
-- erp.enforce_account_movement_routing — el guardián de la cuenta corriente
--
-- Simétrico al de arriba, más el requerimiento ERP03: una venta en cuenta
-- corriente sin cliente identificado no puede generar deuda de nadie.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.enforce_account_movement_routing()
RETURNS TRIGGER AS $$
DECLARE
  v_posts_account BOOLEAN;
  v_requires_customer BOOLEAN;
  v_customer_id UUID;
BEGIN
  IF NEW.sale_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pm.posts_account, pm.requires_customer, s.customer_id
    INTO v_posts_account, v_requires_customer, v_customer_id
    FROM erp.sales s
    JOIN erp.payment_methods pm ON pm.code = s.payment_method
   WHERE s.id = NEW.sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La venta no existe' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_posts_account THEN
    RAISE EXCEPTION
      'Esa venta no es en cuenta corriente: no puede generar un movimiento de deuda'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_requires_customer AND v_customer_id IS NULL THEN
    RAISE EXCEPTION
      'Una venta en cuenta corriente necesita un cliente identificado'
      USING ERRCODE = 'ERP03';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.enforce_account_movement_routing() IS
  'Rechaza un movimiento de cuenta corriente ligado a una venta cuyo método '
  'no tiene posts_account, y rechaza con ERP03 la venta en cuenta corriente '
  'sin cliente identificado.';

CREATE TRIGGER erp_account_movements_routing
  BEFORE INSERT ON erp.account_movements
  FOR EACH ROW EXECUTE FUNCTION erp.enforce_account_movement_routing();

-- ----------------------------------------------------------------------------
-- erp.register_sale(p_payload JSONB) — una venta, una transacción
--
-- `SECURITY DEFINER` por la misma razón que `erp.register_purchase()` (105) y
-- `erp.register_account_payment()` (107): PostgREST no da transacción entre
-- llamadas separadas, y esta función escribe cuatro tablas (`sales`,
-- `sale_items`, `stock_movements` y, según el método, `cash_movements` o
-- `account_movements`) que tienen que quedar todas escritas o ninguna.
--
-- Forma esperada del payload:
--   {
--     "customer_id": "uuid" | null,
--     "payment_method": "efectivo" | "tarjeta" | "transferencia" | "cuenta_corriente",
--     "items": [
--       { "product_id": "uuid", "quantity": 2, "unit_price_cents": 150000 },
--       ...
--     ]
--   }
--
-- OJO — RLS nunca corre adentro de un `SECURITY DEFINER`: un `FOREIGN KEY`
-- prueba que el cliente o el producto EXISTEN, no que sean DE ESTA
-- institución (mismo comentario que `erp.register_purchase()`, 105:145-151,
-- y `erp.register_account_payment()`, 107:322-325). Por eso `customer_id` se
-- valida antes de insertar la venta, y cada `product_id`, DENTRO del loop de
-- líneas — no antes, porque cada línea trae el suyo.
--
-- ORDEN DE LOCKS: productos ASC → cliente → cajón (design.md — "products ASC
-- → customers → cash_accounts"). Las líneas se ordenan por `product_id` antes
-- de insertarse para que dos ventas concurrentes de varias líneas nunca se
-- traben en el orden contrario; el cliente (si lo hay) se toca antes que el
-- cajón porque `erp.apply_account_movement()`/`erp.apply_cash_movement()` ya
-- toman `FOR UPDATE` sobre esas filas en ese orden.
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
BEGIN
  v_institution_id := erp.my_institution_id();

  IF NOT erp.has_access(v_institution_id, 'ventas') THEN
    RAISE EXCEPTION 'Sin acceso a Ventas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_payment_method := p_payload ->> 'payment_method';
  v_customer_id := NULLIF(p_payload ->> 'customer_id', '')::UUID;

  -- El medio de pago que exige cliente se valida ACÁ, antes de tocar un solo
  -- libro, y no solo en el trigger de ruteo de `account_movements`.
  --
  -- El trigger lo comprueba igual y sigue siendo la red que un módulo futuro
  -- no puede saltear. Pero no es el que habla: sobre la misma tabla corren dos
  -- triggers BEFORE INSERT y Postgres los dispara en orden ALFABÉTICO, así que
  -- `erp_account_movements_apply` (107) llega primero, busca un cliente que es
  -- NULL y corta con "El cliente no existe". Cierto y bloqueante, pero le
  -- miente a quien está en el mostrador: el problema no es que el cliente no
  -- exista, es que no eligió ninguno. Y con ese SQLSTATE la acción no puede
  -- marcar el campo del formulario.
  --
  -- Pelear con el alfabeto renombrando triggers sería frágil y opaco. El
  -- mensaje legible va en la puerta de entrada, que es donde se conoce el
  -- formulario.
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

  -- Un `FOREIGN KEY` valida que el cliente EXISTA, no que sea DE ESTA
  -- institución: `SECURITY DEFINER` ve todas las filas de `erp.customers`.
  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM erp.customers
     WHERE id = v_customer_id
       AND institution_id = v_institution_id
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece a esta institución'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Snapshot fiscal congelado, requerimiento pendiente de `erp-customers`.
  -- NULL cuando no hay cliente identificado: no hay nada que congelar.
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

  -- El total se calcula sumando las líneas antes de insertar la venta: el
  -- `NOT NULL CHECK (total_cents >= 0)` de `erp.sales` exige el valor desde
  -- el primer INSERT, y recalcularlo con un UPDATE después sería una segunda
  -- escritura para un dato que ya se puede tener de entrada.
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

  -- Líneas ordenadas por `product_id` ASC — orden fijo de locks (design.md).
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_payload -> 'items')
     ORDER BY (value ->> 'product_id')::UUID ASC
  LOOP
    -- Mismo razonamiento que con el cliente, ahora por línea: el producto
    -- tiene que ser de esta institución, o la venta descontaría stock de un
    -- catálogo ajeno.
    IF NOT EXISTS (
      SELECT 1 FROM erp.products
       WHERE id = (v_item ->> 'product_id')::UUID
         AND institution_id = v_institution_id
    ) THEN
      RAISE EXCEPTION 'El producto no pertenece a esta institución'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_line_total := (v_item ->> 'quantity')::NUMERIC * (v_item ->> 'unit_price_cents')::BIGINT;

    INSERT INTO erp.sale_items (sale_id, product_id, quantity, unit_price_cents)
    VALUES (
      v_sale_id,
      (v_item ->> 'product_id')::UUID,
      (v_item ->> 'quantity')::NUMERIC,
      (v_item ->> 'unit_price_cents')::BIGINT
    );

    -- Salida de stock. Puede levantar ERP01 (102) — la RAISE aborta toda la
    -- transacción, así que la venta y las líneas ya insertadas también se
    -- revierten. Nada queda a medio cargar.
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

  -- Ruteo del cobro: exactamente un libro, nunca los dos. Los triggers de
  -- arriba son el cinturón; esto es el porqué de que solo uno de los dos
  -- INSERT de abajo se ejecute.
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
  'Inserta el documento de venta, sus líneas, un movimiento de stock por '
  'línea (kind=sale) y exactamente un movimiento de cobro (cash o account, '
  'según erp.payment_methods). Una transacción. Exige '
  'erp.has_access(institution_id, ''ventas'').';

REVOKE EXECUTE ON FUNCTION erp.register_sale(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION erp.register_sale(JSONB) TO authenticated;

-- ============================================================================
-- Permisos y RLS — plantilla de la 100, gateadas por el módulo 'ventas'
-- ============================================================================

-- Tabla de referencia: no lleva `institution_id`, no tiene RLS. El acceso de
-- lectura alcanza con el GRANT — es un catálogo global de solo lectura, igual
-- de visible para cualquier institución (los métodos de pago no son un dato
-- del negocio de nadie en particular).
GRANT SELECT ON erp.payment_methods TO authenticated;

GRANT SELECT, INSERT, UPDATE ON erp.sales TO authenticated;
ALTER TABLE erp.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_select" ON erp.sales FOR SELECT
  USING (erp.has_access(institution_id, 'ventas'));

-- El INSERT/UPDATE directo por `authenticated` queda habilitado por
-- completitud de la plantilla, igual que `erp.purchases` (105) y
-- `erp.customers` (107): el camino real de escritura es
-- `erp.register_sale()`, el único que además inserta las líneas, el
-- movimiento de stock y el cobro en la misma transacción.
CREATE POLICY "sales_insert" ON erp.sales FOR INSERT
  WITH CHECK (erp.has_access(institution_id, 'ventas'));

-- UPDATE habilitado para que `erp.void_sale()` (109, próxima migración)
-- pueda marcar `status = 'voided'` sin necesitar `SECURITY DEFINER` para esa
-- sola escritura de columna.
CREATE POLICY "sales_update" ON erp.sales FOR UPDATE
  USING (erp.has_access(institution_id, 'ventas'))
  WITH CHECK (erp.has_access(institution_id, 'ventas'));

-- Sin DELETE: una venta es historia contable, igual que una compra (105).

-- `sale_items` es historia de línea, igual que `purchase_items` (105):
-- append-only, sin UPDATE ni DELETE para `authenticated`.
GRANT SELECT, INSERT ON erp.sale_items TO authenticated;
ALTER TABLE erp.sale_items ENABLE ROW LEVEL SECURITY;

-- No hay `institution_id` en `sale_items`: se resuelve vía el JOIN implícito
-- con `sales`, mismo criterio que `purchase_items_select` (105:276-283).
CREATE POLICY "sale_items_select" ON erp.sale_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM erp.sales s
       WHERE s.id = sale_items.sale_id
         AND erp.has_access(s.institution_id, 'ventas')
    )
  );

CREATE POLICY "sale_items_insert" ON erp.sale_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM erp.sales s
       WHERE s.id = sale_items.sale_id
         AND erp.has_access(s.institution_id, 'ventas')
    )
  );

-- Sin UPDATE ni DELETE: una línea de venta es historia, igual que una línea
-- de compra (105) o un movimiento de stock (101).
