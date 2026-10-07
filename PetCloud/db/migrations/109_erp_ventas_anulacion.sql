-- ============================================================================
-- PetCloud ERP — Migración 109: anulación de ventas
--
-- Cierra lo que la 108 dejó explícitamente pendiente (108:344-346):
-- `erp.void_sale()`. Anular una venta emite un contrasiento por CADA libro
-- que la venta tocó — nunca edita ni borra `erp.sales`, `erp.sale_items` ni
-- los movimientos originales. Mismo criterio que `erp.void_movement()` (101),
-- `erp.void_cash_movement()` (106) y `erp.void_account_movement()` (107): dos
-- escrituras (marcar el original, insertar el espejo) en una sola función
-- para que una falla de red entre medio no descuadre el libro.
--
-- POR QUÉ NO SE EDITA LA 108 — migraciones append-only, siempre. Se revisó a
-- propósito si los triggers `erp_cash_movements_routing` /
-- `erp_account_movements_routing` (108) rechazarían un contrasiento: los dos
-- miran `NEW.sale_id`, resuelven la venta y comparan el método de pago —
-- nunca miran `voids_movement_id` ni el estado de la venta. Un contrasiento
-- de una venta en efectivo sigue siendo un `cash_movement` de una venta cuyo
-- `payment_method` sigue apuntando a `posts_cash = true`: el trigger lo deja
-- pasar sin cambios. No hace falta ningún `ALTER`/`CREATE OR REPLACE` sobre
-- esos triggers.
--
-- CÓMO SE ENCUENTRA EL MOVIMIENTO ORIGINAL DE STOCK — `erp.stock_movements`
-- no tiene columna `sale_id` (a diferencia de `cash_movements` y
-- `account_movements`, que la tienen desde la 106/107): `erp.register_sale()`
-- (108) solo deja la marca en `note = 'Venta ' || sale_id`. Por eso el
-- contrasiento de stock se busca por `product_id` + `note` + `kind = 'sale'`
-- + `voided_at IS NULL` + `voids_movement_id IS NULL`, tomando el primero por
-- `created_at`. Si la venta tuviera dos líneas del mismo producto, la primera
-- iteración marca esa fila `voided_at`, así que la segunda iteración del loop
-- ya no la vuelve a encontrar y toma la que sigue — el `WHERE voided_at IS
-- NULL` resuelve la ambigüedad sin necesitar una columna nueva.
--
-- LAS TRES REGLAS DE ANULACIÓN, iguales en los cuatro libros del schema:
--   · una venta ya anulada no se puede volver a anular (`status = 'voided'`
--     lo garantiza a nivel de `erp.sales`);
--   · un contrasiento no se anula (se filtra con `voids_movement_id IS NULL`
--     al elegir QUÉ movimiento contrasentar — nunca se elige uno que ya es
--     un contrasiento);
--   · anular nunca edita ni borra el original: solo marca `voided_at` e
--     inserta la fila espejo.
--
-- `voids_movement_id` se completa en LOS TRES contrasientos que esta función
-- puede emitir. No es cosmético: es la columna que exime al contrasiento de
-- las dos guardas de saldo negativo — `erp.check_stock_suficiente()` (102)
-- vuelve temprano si `voids_movement_id IS NOT NULL`, y
-- `erp.apply_cash_movement()` (106) solo bloquea cuando
-- `voids_movement_id IS NULL`. Sin esa columna puesta, anular una venta en
-- efectivo cuyo dinero ya se retiró del cajón chocaría con `ERP02`, y anular
-- una venta cuyo stock ya volvió a venderse chocaría con `ERP01`. Anular
-- tiene que poder ejecutarse SIEMPRE: ese es el punto entero de un
-- contrasiento.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.void_sale(
  p_sale_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_sale erp.sales;
  v_professional_id UUID;
  v_item RECORD;
  v_stock_mov RECORD;
  v_cash_mov RECORD;
  v_account_mov RECORD;
  v_note TEXT;
BEGIN
  -- `FOR UPDATE` serializa dos anulaciones concurrentes de la misma venta:
  -- sin esto, las dos podrían leer `status = 'registered'` antes de que
  -- cualquiera escriba, y las dos pasarían la guarda de abajo.
  SELECT * INTO v_sale
    FROM erp.sales
   WHERE id = p_sale_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La venta no existe' USING ERRCODE = 'no_data_found';
  END IF;

  -- OJO — RLS nunca corre adentro de un `SECURITY DEFINER`: un `FOREIGN KEY`
  -- (o, acá, ni siquiera eso) prueba que la venta EXISTE, no que sea DE ESTA
  -- institución. Mismo comentario que `erp.register_sale()` (108:255-260) y
  -- `erp.void_movement()` (101:187-190). Sin esta línea, cualquier
  -- institución podría anular la venta de otra con solo conocer su UUID.
  IF NOT erp.has_access(v_sale.institution_id, 'ventas') THEN
    RAISE EXCEPTION 'Sin acceso a Ventas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_sale.status = 'voided' THEN
    RAISE EXCEPTION 'Esa venta ya estaba anulada' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_professional_id := public.my_vet_professional_id();
  v_note := COALESCE(p_reason, 'Anulación de venta ' || p_sale_id);

  -- ------------------------------------------------------------------------
  -- 1) Stock: un contrasiento por línea. Ordenado por `product_id` ASC,
  --    mismo orden fijo de locks que `erp.register_sale()` (108:262-267) —
  --    para que una anulación y una venta concurrentes sobre los mismos
  --    productos nunca se traben en sentido contrario.
  -- ------------------------------------------------------------------------
  FOR v_item IN
    SELECT product_id
      FROM erp.sale_items
     WHERE sale_id = p_sale_id
     ORDER BY product_id ASC
  LOOP
    SELECT id, quantity, unit_cost_cents INTO v_stock_mov
      FROM erp.stock_movements
     WHERE product_id = v_item.product_id
       AND kind = 'sale'
       AND note = 'Venta ' || p_sale_id::text
       AND voided_at IS NULL
       AND voids_movement_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'No se encontró el movimiento de stock original de esta línea de venta'
        USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE erp.stock_movements
       SET voided_at = now(),
           voided_by = v_professional_id
     WHERE id = v_stock_mov.id;

    -- El contrasiento invierte el signo del original: una salida (`sale`,
    -- cantidad negativa) vuelve como entrada, misma magnitud. Nunca se anula
    -- un `stock_movement` bloqueado por `erp.check_stock_suficiente()` (102):
    -- ese trigger vuelve temprano cuando `voids_movement_id IS NOT NULL`.
    INSERT INTO erp.stock_movements (
      institution_id, product_id, kind, quantity, unit_cost_cents,
      note, voids_movement_id, created_by
    ) VALUES (
      v_sale.institution_id,
      v_item.product_id,
      'sale',
      -v_stock_mov.quantity,
      v_stock_mov.unit_cost_cents,
      v_note,
      v_stock_mov.id,
      v_professional_id
    );
  END LOOP;

  -- ------------------------------------------------------------------------
  -- 2) Cobro: a lo sumo UNO de los dos libros, nunca los dos — el mismo
  --    ruteo que `erp.register_sale()` hizo al cobrar. Tarjeta y
  --    transferencia no postearon a ningún libro, así que acá tampoco emiten
  --    contrasiento: no hay nada que revertir.
  -- ------------------------------------------------------------------------
  SELECT id, cash_account_id, amount_cents INTO v_cash_mov
    FROM erp.cash_movements
   WHERE sale_id = p_sale_id
     AND voided_at IS NULL
     AND voids_movement_id IS NULL
   FOR UPDATE;

  IF FOUND THEN
    UPDATE erp.cash_movements
       SET voided_at = now(),
           voided_by = v_professional_id
     WHERE id = v_cash_mov.id;

    -- Nunca choca con `ERP02` (106): `erp.apply_cash_movement()` solo
    -- bloquea el saldo negativo cuando `voids_movement_id IS NULL`.
    INSERT INTO erp.cash_movements (
      institution_id, cash_account_id, sale_id, kind, amount_cents,
      note, voids_movement_id, created_by
    ) VALUES (
      v_sale.institution_id,
      v_cash_mov.cash_account_id,
      p_sale_id,
      'sale',
      -v_cash_mov.amount_cents,
      v_note,
      v_cash_mov.id,
      v_professional_id
    );
  ELSE
    SELECT id, customer_id, amount_cents INTO v_account_mov
      FROM erp.account_movements
     WHERE sale_id = p_sale_id
       AND voided_at IS NULL
       AND voids_movement_id IS NULL
     FOR UPDATE;

    IF FOUND THEN
      UPDATE erp.account_movements
         SET voided_at = now(),
             voided_by = v_professional_id
       WHERE id = v_account_mov.id;

      -- `erp.apply_account_movement()` (107) nunca bloquea saldo negativo,
      -- contrasiento o no — ver el comentario grande de esa función.
      INSERT INTO erp.account_movements (
        institution_id, customer_id, sale_id, kind, amount_cents,
        note, voids_movement_id, created_by
      ) VALUES (
        v_sale.institution_id,
        v_account_mov.customer_id,
        p_sale_id,
        'sale',
        -v_account_mov.amount_cents,
        v_note,
        v_account_mov.id,
        v_professional_id
      );
    END IF;
  END IF;

  UPDATE erp.sales
     SET status = 'voided'
   WHERE id = p_sale_id;

  RETURN p_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.void_sale(UUID, TEXT) IS
  'Anula una venta insertando un contrasiento por cada libro que tocó '
  '(stock por línea, y cash o account según el método de pago). No edita ni '
  'borra erp.sales, erp.sale_items ni los movimientos originales — solo '
  'marca voided_at e inserta el espejo. Rechaza anular una venta ya '
  'anulada. Exige erp.has_access(institution_id, ''ventas'').';

REVOKE EXECUTE ON FUNCTION erp.void_sale(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION erp.void_sale(UUID, TEXT) TO authenticated;
