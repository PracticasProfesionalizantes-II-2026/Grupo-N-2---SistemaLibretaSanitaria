-- ============================================================================
-- PetCloud ERP — Migración 105: proveedores y compras
--
-- Segundo módulo de negocio del ERP. Depende de dos cosas que ya existen:
-- `erp.products`/`erp.stock_movements` (101, con su guarda de la 102) para el
-- lado del stock, y `erp.has_access(institution_id, module)` (104) para el
-- gate de acceso — Compras es owner-only por defecto, delegable.
--
-- LA DECISIÓN QUE GOBIERNA ESTE MÓDULO: una compra es un documento
-- (`erp.purchases` + `erp.purchase_items`) que **produce** movimientos de
-- stock, nunca al revés. El documento es la intención del negocio ("le compré
-- esto a este proveedor, a este precio"); el movimiento es el efecto sobre el
-- estante. Separarlos es lo que permite mostrar "qué compré" sin tener que
-- reconstruirlo a partir del libro de movimientos, y a la vez seguir
-- confiando en ese libro como única fuente de verdad del stock.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- erp.suppliers — el proveedor
--
-- Sin `tax_id` NOT NULL: hay veterinarias chicas que compran a un proveedor
-- informal sin CUIT, y obligar el dato ahí sería bloquear una compra real por
-- un campo que el módulo fiscal (fuera de este slice) todavía no exige.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,

  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  tax_id TEXT,
  phone TEXT,
  email TEXT,

  -- Un proveedor no se borra: se desactiva. Sus compras históricas siguen
  -- siendo parte del libro (mismo criterio que `erp.products`, 101).
  active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_suppliers_institution ON erp.suppliers(institution_id);

CREATE TRIGGER erp_suppliers_updated_at
  BEFORE UPDATE ON erp.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- erp.purchases — el documento
--
-- `status` es TEXT con CHECK y no un enum, mismo criterio que
-- `erp.products.unit` (101): ampliar un CHECK no pide lock ni migración
-- especial. Por ahora el único valor real es `registered` — todavía no hay un
-- flujo de "borrador" ni de "recibido parcial" en este slice — pero dejar el
-- CHECK abierto a futuros estados cuesta una migración menos que un enum.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES erp.suppliers(id) ON DELETE RESTRICT,

  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered')),

  note TEXT,

  created_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_purchases_institution ON erp.purchases(institution_id);
CREATE INDEX idx_erp_purchases_supplier ON erp.purchases(supplier_id);
CREATE INDEX idx_erp_purchases_created_by ON erp.purchases(created_by);

-- ----------------------------------------------------------------------------
-- erp.purchase_items — las líneas
--
-- `unit_cost_cents` se copia tal cual al `stock_movements.unit_cost_cents`
-- que emite `erp.register_purchase()` — es la misma cifra en dos tablas a
-- propósito: una es el documento comercial (lo que se le compró al
-- proveedor), la otra es la historia congelada del costo (101:124-129). Que
-- coincidan hoy no las vuelve una la misma cosa que la otra mañana si algún
-- día una compra se corrige por otro camino.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES erp.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES erp.products(id) ON DELETE RESTRICT,

  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost_cents BIGINT NOT NULL CHECK (unit_cost_cents >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_purchase_items_purchase ON erp.purchase_items(purchase_id);
CREATE INDEX idx_erp_purchase_items_product ON erp.purchase_items(product_id);

-- ----------------------------------------------------------------------------
-- erp.register_purchase(p_payload JSONB) — una compra, una transacción
--
-- `SECURITY DEFINER` por la misma razón que `erp.void_movement()` (101): tiene
-- que escribir en `erp.stock_movements` y `erp.products` con la autoridad de
-- la función, no del rol `authenticated`, porque PostgREST no da una
-- transacción entre llamadas separadas. El control de acceso lo hace ella
-- misma en la primera línea — sin eso, un SECURITY DEFINER es un agujero.
--
-- Forma esperada del payload:
--   {
--     "supplier_id": "uuid",
--     "note": "texto opcional",
--     "items": [
--       { "product_id": "uuid", "quantity": 5, "unit_cost_cents": 70000 },
--       ...
--     ]
--   }
--
-- Por cada línea: (1) INSERT en `erp.stock_movements` con `kind='purchase'` y
-- cantidad positiva — dispara los triggers de la 101 (`apply_movement`, que
-- suma al caché) y de la 102 (`check_stock_suficiente`, que no hace nada
-- porque una entrada nunca se rechaza); (2) UPDATE de
-- `erp.products.cost_cents` al valor de esta línea — decisión 4 del diseño:
-- la compra freeza el costo histórico Y actualiza "lo que cuesta hoy", las
-- dos cosas, en la misma transacción.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.register_purchase(p_payload JSONB)
RETURNS UUID AS $$
DECLARE
  v_institution_id UUID;
  v_professional_id UUID;
  v_purchase_id UUID;
  v_item JSONB;
BEGIN
  v_institution_id := erp.my_institution_id();

  IF NOT erp.has_access(v_institution_id, 'compras') THEN
    RAISE EXCEPTION 'Sin acceso a Compras' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_array_length(p_payload -> 'items') = 0 THEN
    RAISE EXCEPTION 'Una compra necesita al menos una línea'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Un `FOREIGN KEY` valida que el proveedor EXISTA, no que sea DE ESTA
  -- institución: `SECURITY DEFINER` ve todas las filas de `erp.suppliers`,
  -- no solo las que RLS le dejaría ver a quien llama. Sin esta comprobación,
  -- cualquier institución con acceso a Compras podría anotar una compra
  -- contra el proveedor de otra, con el mismo `SECURITY DEFINER` que hace
  -- posible la función. La política de RLS jamás se ejecuta acá adentro,
  -- así que el chequeo tiene que estar escrito a mano.
  IF NOT EXISTS (
    SELECT 1 FROM erp.suppliers
     WHERE id = (p_payload ->> 'supplier_id')::UUID
       AND institution_id = v_institution_id
  ) THEN
    RAISE EXCEPTION 'El proveedor no pertenece a esta institución'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_professional_id := public.my_vet_professional_id();

  INSERT INTO erp.purchases (institution_id, supplier_id, note, created_by)
  VALUES (
    v_institution_id,
    (p_payload ->> 'supplier_id')::UUID,
    p_payload ->> 'note',
    v_professional_id
  )
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload -> 'items')
  LOOP
    -- Mismo razonamiento que con el proveedor, ahora por línea: el producto
    -- tiene que ser de esta institución, o la compra movería el stock —y
    -- reescribiría el costo— de un catálogo ajeno.
    IF NOT EXISTS (
      SELECT 1 FROM erp.products
       WHERE id = (v_item ->> 'product_id')::UUID
         AND institution_id = v_institution_id
    ) THEN
      RAISE EXCEPTION 'El producto no pertenece a esta institución'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO erp.purchase_items (purchase_id, product_id, quantity, unit_cost_cents)
    VALUES (
      v_purchase_id,
      (v_item ->> 'product_id')::UUID,
      (v_item ->> 'quantity')::NUMERIC,
      (v_item ->> 'unit_cost_cents')::BIGINT
    );

    INSERT INTO erp.stock_movements (
      institution_id, product_id, kind, quantity, unit_cost_cents,
      note, created_by
    ) VALUES (
      v_institution_id,
      (v_item ->> 'product_id')::UUID,
      'purchase',
      (v_item ->> 'quantity')::NUMERIC,
      (v_item ->> 'unit_cost_cents')::BIGINT,
      'Compra ' || v_purchase_id,
      v_professional_id
    );

    UPDATE erp.products
       SET cost_cents = (v_item ->> 'unit_cost_cents')::BIGINT
     WHERE id = (v_item ->> 'product_id')::UUID;
  END LOOP;

  RETURN v_purchase_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.register_purchase(JSONB) IS
  'Inserta el documento de compra, sus líneas, un movimiento de stock por '
  'línea (kind=purchase) y actualiza products.cost_cents. Una transacción. '
  'Exige erp.has_access(institution_id, ''compras'').';

REVOKE EXECUTE ON FUNCTION erp.register_purchase(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION erp.register_purchase(JSONB) TO authenticated;

-- ============================================================================
-- Permisos y RLS — plantilla de la 100, gateadas por el módulo 'compras'
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON erp.suppliers TO authenticated;
ALTER TABLE erp.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON erp.suppliers FOR SELECT
  USING (erp.has_access(institution_id, 'compras'));

CREATE POLICY "suppliers_insert" ON erp.suppliers FOR INSERT
  WITH CHECK (erp.has_access(institution_id, 'compras'));

CREATE POLICY "suppliers_update" ON erp.suppliers FOR UPDATE
  USING (erp.has_access(institution_id, 'compras'))
  WITH CHECK (erp.has_access(institution_id, 'compras'));

-- Sin DELETE: un proveedor se desactiva (`active = false`).

GRANT SELECT, INSERT, UPDATE ON erp.purchases TO authenticated;
ALTER TABLE erp.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_select" ON erp.purchases FOR SELECT
  USING (erp.has_access(institution_id, 'compras'));

-- El INSERT/UPDATE directo por `authenticated` queda habilitado por
-- completitud de la plantilla, pero el camino real de escritura es
-- `erp.register_purchase()` (SECURITY DEFINER): es el único que además
-- inserta las líneas y el movimiento de stock en la misma transacción. Un
-- INSERT directo a `erp.purchases` crearía un documento sin líneas ni efecto
-- en el stock, que es un estado que la aplicación no genera pero que la RLS
-- no tiene por qué impedir — el mismo criterio que `erp.products` (101), que
-- también acepta escritura directa además de su función de conveniencia.
CREATE POLICY "purchases_insert" ON erp.purchases FOR INSERT
  WITH CHECK (erp.has_access(institution_id, 'compras'));

CREATE POLICY "purchases_update" ON erp.purchases FOR UPDATE
  USING (erp.has_access(institution_id, 'compras'))
  WITH CHECK (erp.has_access(institution_id, 'compras'));

-- Sin DELETE: una compra no se borra, es historia contable.

-- `purchase_items` es historia de línea, igual que `stock_movements` (101):
-- append-only, sin UPDATE ni DELETE para `authenticated`. Solo SELECT/INSERT.
GRANT SELECT, INSERT ON erp.purchase_items TO authenticated;
ALTER TABLE erp.purchase_items ENABLE ROW LEVEL SECURITY;

-- No hay `institution_id` en `purchase_items`: se resuelve vía el JOIN
-- implícito con `purchases`, igual que la política tendría que recorrer la FK
-- si la tabla tuviera la columna. Se expresa con un EXISTS porque
-- `erp.has_access()` necesita el UUID de la institución, no el id de la
-- compra.
CREATE POLICY "purchase_items_select" ON erp.purchase_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM erp.purchases p
       WHERE p.id = purchase_items.purchase_id
         AND erp.has_access(p.institution_id, 'compras')
    )
  );

CREATE POLICY "purchase_items_insert" ON erp.purchase_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM erp.purchases p
       WHERE p.id = purchase_items.purchase_id
         AND erp.has_access(p.institution_id, 'compras')
    )
  );

-- Sin UPDATE ni DELETE: una línea de compra es historia, igual que un
-- movimiento de stock (101). Corregir una compra cargada mal es anular sus
-- movimientos de stock (erp.void_movement, ya existente) y cargar una nueva —
-- este slice no agrega un `void_purchase()` propio porque el stock ya tiene
-- el suyo y duplicarlo sería la reescritura que la 100 pide evitar.
