-- ============================================================================
-- PetCloud ERP — Migración 110: a la caja siempre se puede meter plata
--
-- CORRIGE UN BUG DE LA 106. El guardián `ERP02` rechaza un movimiento cuando
-- el saldo quedaría por debajo de cero, y copió de `check_stock_suficiente()`
-- (102) la exención de los contrasientos — pero NO la otra, la que exime a las
-- entradas. La 102 tiene dos salidas tempranas; la 106 se quedó con una.
--
-- La consecuencia es peor que la asimetría:
--
--   1. Un contrasiento SÍ puede dejar el cajón en negativo, y tiene que poder:
--      anular una venta cobrada en efectivo saca esa plata del cajón, exista o
--      no todavía. Esa exención es correcta y se mantiene.
--   2. Con el saldo ya en negativo, CUALQUIER ingreso quedaba rechazado,
--      porque `saldo + monto < 0` sigue siendo cierto aunque el monto sea
--      positivo. Una venta en efectivo de $3.000 sobre un saldo de −$10.000 da
--      −$7.000: sigue siendo negativo, así que el guardián la frenaba.
--
-- Es decir: el cajón podía entrar en un estado del que no se salía. La única
-- forma de arreglarlo era la que el guardián justamente impide — y sumar plata
-- NUNCA puede empeorar un saldo negativo.
--
-- Lo destapó la suite de RLS de ventas al anular varias ventas seguidas: el
-- saldo se fue a −$10.000 por los contrasientos y la venta siguiente falló con
-- ERP02. Ninguna verificación anterior lo vio, ni siquiera la prueba de
-- mutación sobre la 106: esa comprobó que el guardián BLOQUEA una salida sin
-- fondos, nunca que DEJA ENTRAR un ingreso. Una mutación prueba que un test
-- muerde, no que el conjunto de propiedades esté completo.
--
-- Se reemplaza la función entera en vez de editar la 106: las migraciones son
-- append-only.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.apply_cash_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  -- Un contrasiento nunca se bloquea: anular tiene que poder ejecutarse
  -- siempre, o el libro no tendría forma de corregir un error de carga.
  IF NEW.voids_movement_id IS NOT NULL THEN
    UPDATE erp.cash_accounts
       SET balance_cents = balance_cents + NEW.amount_cents
     WHERE id = NEW.cash_account_id;

    RETURN NEW;
  END IF;

  -- ENTRADA: sumar no puede dejar el cajón más abajo de donde estaba. Esta es
  -- la salida temprana que faltaba, y sin ella un saldo negativo era
  -- irreversible. Misma forma que `check_stock_suficiente()` (102:45-48).
  IF NEW.amount_cents > 0 THEN
    UPDATE erp.cash_accounts
       SET balance_cents = balance_cents + NEW.amount_cents
     WHERE id = NEW.cash_account_id;

    RETURN NEW;
  END IF;

  -- `FOR UPDATE` no es decorativo: sin el bloqueo, dos salidas simultáneas del
  -- mismo cajón leerían el mismo saldo, las dos pasarían la verificación y el
  -- resultado quedaría negativo igual.
  SELECT balance_cents INTO v_balance
    FROM erp.cash_accounts
   WHERE id = NEW.cash_account_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La caja no existe' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_balance + NEW.amount_cents < 0 THEN
    RAISE EXCEPTION
      'La caja quedaría en negativo: hay % y el movimiento es de %.',
      v_balance, NEW.amount_cents
      USING ERRCODE = 'ERP02';
  END IF;

  UPDATE erp.cash_accounts
     SET balance_cents = balance_cents + NEW.amount_cents
   WHERE id = NEW.cash_account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.apply_cash_movement() IS
  'Mantiene el caché de saldo del cajón y bloquea las SALIDAS que lo dejarían '
  'negativo (ERP02). Las entradas y los contrasientos nunca se bloquean: '
  'sumar no empeora un saldo negativo, y anular tiene que poder siempre.';
