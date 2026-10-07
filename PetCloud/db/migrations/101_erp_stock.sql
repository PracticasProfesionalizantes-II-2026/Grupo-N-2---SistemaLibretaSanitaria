-- ============================================================================
-- PetCloud ERP — Migración 101: stock
--
-- Primer módulo del ERP. Es el único que no depende de ningún otro: Ventas
-- descuenta stock, Compras lo ingresa, Caja necesita algo que vender. Por eso
-- va primero.
--
-- LA DECISIÓN DE DISEÑO QUE GOBIERNA TODO EL MÓDULO: el stock **no es un
-- número que se edita**, es la suma de un libro de movimientos.
--
-- La tentación es obvia: una columna `stock` en `products` y un `UPDATE` cada
-- vez que entra o sale algo. Es más simple de escribir y es exactamente lo que
-- convierte a un ERP en una planilla cara. El día que el estante dice 9 y el
-- sistema dice 12, con una columna suelta no hay forma de saber qué pasó: solo
-- queda corregir el número a mano y esperar que no vuelva a pasar. Con un
-- libro de movimientos, la respuesta está escrita — quién, cuándo, cuánto y
-- por qué.
--
-- La trazabilidad no es una feature del ERP. Es el ERP.
--
-- PERO leer el stock sumando el libro entero en cada consulta no escala: un
-- listado de 300 productos serían 300 agregaciones. Así que `products.stock`
-- existe como **caché**, y el único que la escribe es el trigger de esta
-- migración. La fuente de verdad sigue siendo `stock_movements`, y al pie de
-- este archivo queda la consulta de reconciliación para probarlo cuando haga
-- falta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- erp.products — el catálogo
--
-- `cost_cents` y `price_cents` en BIGINT de centavos, no NUMERIC de pesos:
-- mismo criterio que `vet_subscriptions.amount_cents` (040). La aritmética de
-- punto flotante sobre dinero acumula error, y en un módulo que va a terminar
-- emitiendo facturas ese error es un problema legal, no estético.
--
-- `sku` es único **por institución**, no global: dos veterinarias distintas
-- pueden usar el mismo código interno para cosas distintas, y no tienen por
-- qué enterarse una de la otra.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,

  sku TEXT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  category TEXT,

  -- Unidad de medida. TEXT con CHECK y no un enum de Postgres: agregar un
  -- valor a un enum exige una migración y un lock; acá alcanza con ampliar el
  -- CHECK. Mismo criterio que `appointments.status` (041).
  unit TEXT NOT NULL DEFAULT 'unidad'
    CHECK (unit IN ('unidad', 'caja', 'ml', 'l', 'g', 'kg', 'dosis')),

  cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  price_cents BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),

  -- Debajo de esto, el producto aparece en el aviso de reposición.
  min_stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),

  -- CACHÉ del libro de movimientos. Solo la escribe `erp.apply_movement()`.
  -- Puede quedar negativa a propósito: ver el comentario de la política de
  -- INSERT de `stock_movements`.
  stock NUMERIC(12,3) NOT NULL DEFAULT 0,

  -- Un producto no se borra: se desactiva. Sus movimientos históricos siguen
  -- siendo parte del libro y una venta de hace ocho meses tiene que poder
  -- explicarse.
  active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres NO indexa el lado hijo de una FK. Sin esto, borrar una institución
-- hace seq scan y los JOIN de RLS pagan lo mismo.
CREATE INDEX idx_erp_products_institution ON erp.products(institution_id);

-- El listado por defecto: activos de mi institución, alfabético.
CREATE INDEX idx_erp_products_listado
  ON erp.products(institution_id, name)
  WHERE active;

-- Parcial y no total: el SKU es opcional, y `NULL` no colisiona en UNIQUE pero
-- sí ocuparía lugar en el índice.
CREATE UNIQUE INDEX idx_erp_products_sku
  ON erp.products(institution_id, sku)
  WHERE sku IS NOT NULL;

CREATE TRIGGER erp_products_updated_at
  BEFORE UPDATE ON erp.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- erp.stock_movements — el libro
--
-- `quantity` es **con signo**: positiva entra, negativa sale. Guardar siempre
-- positivo y deducir el signo del `kind` obliga a que cada consulta que suma
-- conozca la tabla de equivalencias, y basta que una se olvide para que el
-- total mienta. Con el signo en el dato, sumar es sumar.
--
-- `CHECK (quantity <> 0)` porque un movimiento de cero no es un movimiento: es
-- ruido en el libro.
--
-- `kind` describe el **por qué**, que es lo que el signo no cuenta: una salida
-- por venta y una salida por vencimiento restan lo mismo del estante y
-- significan cosas opuestas para el negocio.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES erp.products(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN (
    'purchase',    -- entrada por compra a proveedor
    'sale',        -- salida por venta al cliente
    'use',         -- salida por uso en una atención (vacuna aplicada, insumo)
    'adjustment',  -- corrección de inventario tras un recuento físico
    'loss',        -- salida por rotura, vencimiento o robo
    'return'       -- entrada por devolución del cliente
  )),
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity <> 0),

  -- Copia congelada del costo al momento del movimiento, no una referencia que
  -- se resuelve leyendo `products` cada vez. Misma regla de no retroactividad
  -- que `vet_subscriptions.amount_cents` (040): si mañana sube el precio del
  -- proveedor, lo que entró ayer entró al precio de ayer. Sin esto, cualquier
  -- informe de márgenes histórico se reescribe solo.
  unit_cost_cents BIGINT CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),

  note TEXT,

  -- Un movimiento NO se borra ni se edita: se anula con un contrasiento. Es la
  -- regla de cualquier libro contable y la razón por la que abajo no hay
  -- política de DELETE ni de UPDATE.
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
  voids_movement_id UUID REFERENCES erp.stock_movements(id) ON DELETE SET NULL,

  created_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_movements_institution ON erp.stock_movements(institution_id);
CREATE INDEX idx_erp_movements_created_by ON erp.stock_movements(created_by);
CREATE INDEX idx_erp_movements_voided_by ON erp.stock_movements(voided_by);
CREATE INDEX idx_erp_movements_voids ON erp.stock_movements(voids_movement_id);

-- El libro de un producto, más nuevo primero: es la consulta de la ficha.
CREATE INDEX idx_erp_movements_producto
  ON erp.stock_movements(product_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- erp.apply_movement — el único que escribe `products.stock`
--
-- AFTER INSERT y no BEFORE: si el INSERT falla por una restricción posterior,
-- el caché no tiene que haberse movido.
--
-- No hay rama de UPDATE ni de DELETE porque no hay política que los permita.
-- Anular es insertar el contrasiento, y ese INSERT pasa por acá como
-- cualquier otro — el caché se corrige solo, sin un camino especial que
-- mantener.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.apply_movement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE erp.products
     SET stock = stock + NEW.quantity
   WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

CREATE TRIGGER erp_movements_apply
  AFTER INSERT ON erp.stock_movements
  FOR EACH ROW EXECUTE FUNCTION erp.apply_movement();

-- ----------------------------------------------------------------------------
-- erp.void_movement — anular con contrasiento
--
-- Marca el original como anulado e inserta su espejo. Las dos cosas en una
-- función y no en dos llamadas desde la aplicación: si se hicieran por
-- separado, una falla de red entre medio dejaría el libro descuadrado sin que
-- nadie se entere. Acá o pasan las dos o no pasa ninguna.
--
-- `SECURITY DEFINER` porque tiene que hacer el UPDATE del `voided_at`, que
-- ninguna política de `authenticated` permite. El control de acceso lo hace
-- ella misma con `erp.has_access()` en la primera línea: sin eso, un
-- SECURITY DEFINER sería un agujero abierto a cualquier institución.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.void_movement(
  p_movement_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_original erp.stock_movements;
  v_professional_id UUID;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_original
    FROM erp.stock_movements
   WHERE id = p_movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento no existe' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT erp.has_access(v_original.institution_id) THEN
    RAISE EXCEPTION 'Sin acceso a ese movimiento' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_original.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ese movimiento ya estaba anulado' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Un contrasiento tampoco se anula: si no, se podría encadenar una ida y
  -- vuelta infinita y el libro dejaría de leerse.
  IF v_original.voids_movement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un contrasiento no se anula' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_professional_id := public.my_vet_professional_id();

  UPDATE erp.stock_movements
     SET voided_at = now(),
         voided_by = v_professional_id
   WHERE id = p_movement_id;

  INSERT INTO erp.stock_movements (
    institution_id, product_id, kind, quantity,
    unit_cost_cents, note, voids_movement_id, created_by
  ) VALUES (
    v_original.institution_id,
    v_original.product_id,
    v_original.kind,
    -v_original.quantity,
    v_original.unit_cost_cents,
    COALESCE(p_reason, 'Anulación'),
    p_movement_id,
    v_professional_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

-- ============================================================================
-- Permisos y RLS — plantilla de la migración 100, sin desviarse
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON erp.products TO authenticated;
ALTER TABLE erp.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select" ON erp.products FOR SELECT
  USING (erp.has_access(institution_id));

CREATE POLICY "products_insert" ON erp.products FOR INSERT
  WITH CHECK (erp.has_access(institution_id));

-- El WITH CHECK no es opcional: sin él, un mismo UPDATE puede mover el
-- producto a otra institución. Es la cláusula que le faltaba a
-- `vet_institutions` (005) y que la 019 tuvo que compensar con un trigger.
CREATE POLICY "products_update" ON erp.products FOR UPDATE
  USING (erp.has_access(institution_id))
  WITH CHECK (erp.has_access(institution_id));

-- Sin DELETE: un producto se desactiva (`active = false`).

GRANT SELECT, INSERT ON erp.stock_movements TO authenticated;
ALTER TABLE erp.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements_select" ON erp.stock_movements FOR SELECT
  USING (erp.has_access(institution_id));

-- El INSERT no valida que quede stock suficiente, a propósito. Una veterinaria
-- que aplica la última dosis mientras el sistema todavía no registró la compra
-- tiene que poder cargarlo igual: bloquear la carga no evita que la dosis se
-- haya aplicado, solo garantiza que el libro no lo cuente. El stock negativo es
-- una señal visible de que falta cargar una entrada, y la pantalla lo muestra
-- como tal.
CREATE POLICY "stock_movements_insert" ON erp.stock_movements FOR INSERT
  WITH CHECK (erp.has_access(institution_id));

-- Sin UPDATE ni DELETE para `authenticated`. El único cambio posible sobre un
-- movimiento es la anulación, y pasa por `erp.void_movement()`, que es
-- SECURITY DEFINER y verifica el acceso por su cuenta.

REVOKE EXECUTE ON FUNCTION erp.void_movement(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION erp.void_movement(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Reconciliación — para cuando alguien dude del caché.
--
-- Tiene que devolver CERO filas. Si devuelve alguna, `products.stock` se
-- separó del libro y hay que averiguar por qué antes de corregirlo a mano: la
-- diferencia es el síntoma, no el problema.
--
--   SELECT p.id, p.name, p.stock AS cache,
--          COALESCE(SUM(m.quantity), 0) AS libro
--     FROM erp.products p
--     LEFT JOIN erp.stock_movements m ON m.product_id = p.id
--    GROUP BY p.id, p.name, p.stock
--   HAVING p.stock <> COALESCE(SUM(m.quantity), 0);
--
-- Nota: la suma incluye los movimientos anulados Y sus contrasientos, que se
-- cancelan entre sí. Es correcto: el libro nunca pierde una línea.
-- ============================================================================
