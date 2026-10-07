-- ============================================================================
-- PetCloud ERP — Migración 102: el stock no puede quedar negativo
--
-- CAMBIA UNA DECISIÓN DE LA 101. Aquella dejaba pasar cualquier salida aunque
-- no hubiera existencias, con este razonamiento: si el veterinario aplicó la
-- última dosis antes de que alguien cargara la compra, bloquear el registro no
-- deshace la dosis — solo logra que no quede asentada.
--
-- El argumento no alcanza. Un ERP que deja vender lo que no hay no está
-- avisando de nada: casi siempre es un error de carga, y el "stock negativo
-- como señal visible" resultó ser una señal que aparece DESPUÉS de que el dato
-- malo ya entró al libro. El caso legítimo tiene salida y es la correcta:
-- cargar primero la entrada, después la salida.
--
-- Las migraciones son append-only, así que la 101 no se toca. El
-- comportamiento se corrige acá, con un trigger.
--
-- DOS EXCEPCIONES, las dos deliberadas:
--
--   · Los contrasientos (`voids_movement_id IS NOT NULL`). Anular tiene que
--     poder ejecutarse SIEMPRE: si anular una compra de 10 quedara bloqueado
--     porque ya se vendieron 7, el libro no tendría forma de corregir un error
--     de carga — que es exactamente para lo que existe la anulación.
--
--   · Las entradas (cantidad positiva). No hace falta revisarlas: sumar nunca
--     deja el stock por debajo de donde estaba.
--
-- Los productos que HOY ya están en negativo siguen así. El trigger mira el
-- resultado de cada movimiento nuevo, no corrige el pasado: para eso está el
-- ajuste de inventario, que puede sumar hasta dejarlos en cero.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.check_stock_suficiente()
RETURNS TRIGGER AS $$
DECLARE
  v_stock NUMERIC(12,3);
  v_nombre TEXT;
BEGIN
  -- Un contrasiento nunca se bloquea: ver la nota de arriba.
  IF NEW.voids_movement_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Entrada: sumar no puede dejar el stock más abajo de donde estaba.
  IF NEW.quantity > 0 THEN
    RETURN NEW;
  END IF;

  -- `FOR UPDATE` no es decorativo. Sin el bloqueo, dos salidas simultáneas del
  -- mismo producto leerían las dos el mismo stock, las dos pasarían la
  -- verificación y el resultado quedaría negativo igual. El bloqueo las pone
  -- en fila: la segunda lee lo que dejó la primera.
  SELECT stock, name INTO v_stock, v_nombre
    FROM erp.products
   WHERE id = NEW.product_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no existe' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_stock + NEW.quantity < 0 THEN
    RAISE EXCEPTION
      'Stock insuficiente de "%": hay % y estás sacando %.',
      v_nombre, v_stock, abs(NEW.quantity)
      USING ERRCODE = 'ERP01';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.check_stock_suficiente() IS
  'Bloquea las salidas que dejarían el stock por debajo de cero. '
  'No aplica a contrasientos ni a entradas. SQLSTATE ERP01.';

-- BEFORE y no AFTER: si el movimiento no puede existir, no tiene que llegar a
-- escribirse ni a mover el caché de `products.stock`.
--
-- El orden entre este trigger y `erp_movements_apply` (101) no compite: aquel
-- es AFTER INSERT, así que corre después de que este haya dejado pasar la fila.
CREATE TRIGGER erp_movements_check_stock
  BEFORE INSERT ON erp.stock_movements
  FOR EACH ROW EXECUTE FUNCTION erp.check_stock_suficiente();
