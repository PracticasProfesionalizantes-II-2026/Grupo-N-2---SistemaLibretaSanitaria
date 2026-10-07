-- ============================================================================
-- PetCloud ERP — Migración 106: caja
--
-- Tercer módulo de negocio del ERP. Depende de `erp.has_access(institution_id,
-- module)` (104) para el gate de acceso — Caja es owner-only por defecto,
-- delegable, igual que Compras (105).
--
-- LA DECISIÓN QUE GOBIERNA ESTE MÓDULO: la caja es un libro continuo, no una
-- máquina de estados de turno abierto/cerrado. Un arqueo es una fila más del
-- libro, no un candado. La tentación es modelar "turno de caja" como una
-- entidad con apertura y cierre, y bloquear ventas fuera de un turno abierto.
-- Eso resuelve un problema que este negocio no tiene (nadie vende "fuera de
-- horario de caja") y crea uno real: un arqueo mal cerrado, o una sesión que
-- se cuelga abierta, bloquearía el mostrador. El libro append-only con
-- timestamps del lado del servidor ya garantiza el orden — ningún movimiento
-- puede quedar fechado antes del último arqueo — sin necesitar un estado que
-- lo haga cumplir.
--
-- SEGUNDA DECISIÓN: el libro de caja ES el cajón. Solo entra ahí lo que se
-- cobra en efectivo. Tarjeta y transferencia nunca tocan `cash_accounts`: esa
-- plata está en el procesador, no en el cajón. Mezclarlas haría que el arqueo
-- fallara todos los días, para nadie que lo use. Este módulo no ofrece una
-- vista de tesorería — esa mezcla queda fuera de alcance.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- erp.cash_accounts — el cajón
--
-- Una fila por institución, y no una vista que suma `SUM(amount_cents)` al
-- vuelo: la suma no tiene nada para tomar con `FOR UPDATE`. Dos movimientos
-- de caja concurrentes tienen que serializarse en algo, igual que dos salidas
-- de stock del mismo producto se serializan en la fila de `erp.products`
-- (102). Esta fila cumple ese rol para el cajón.
--
-- CONSECUENCIA ACEPTADA, dicha en voz alta: esta fila serializa TODA escritura
-- de caja de la institución. A volumen de consultorio veterinario esto no es
-- un cuello de botella real — se acepta acá y se mide si algún día deja de
-- serlo, no al revés.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL UNIQUE
    REFERENCES public.vet_institutions(id) ON DELETE CASCADE,

  -- CACHÉ del libro de movimientos, misma regla que `erp.products.stock`
  -- (101): la escribe únicamente `erp.apply_cash_movement()`.
  balance_cents BIGINT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres NO indexa el lado hijo de una FK (100:118-119). `UNIQUE` ya deja un
-- índice sobre `institution_id`, así que no hace falta uno adicional acá.

-- ----------------------------------------------------------------------------
-- erp.cash_movements — el libro
--
-- `amount_cents` es con signo, mismo criterio que `stock_movements.quantity`
-- (101): positivo entra al cajón, negativo sale. `quantity` acá NO es
-- cantidad de producto — se reutiliza únicamente para el arqueo, donde guarda
-- contado−sistema, la misma cifra que ya viaja en `amount_cents` pero
-- explicada como diferencia y no como movimiento de caja en sí. Se deja NULL
-- en cualquier otro `kind`.
--
-- `sale_id` es NULL en este slice a propósito: `erp.sales` no existe todavía
-- (llega en la 108). La columna se crea ahora para que la 108 solo tenga que
-- agregar la FK y el trigger de ruteo, no reescribir la tabla — append-only
-- también aplica a "dejar el lugar preparado", no solo a "no tocar lo
-- aplicado".
-- ----------------------------------------------------------------------------
CREATE TABLE erp.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,
  cash_account_id UUID NOT NULL REFERENCES erp.cash_accounts(id) ON DELETE CASCADE,

  -- FK a `erp.sales` se agrega en la 108, cuando esa tabla exista. Hasta
  -- entonces esta columna queda sin referencia y siempre NULL.
  sale_id UUID,

  kind TEXT NOT NULL CHECK (kind IN (
    'aporte',         -- plata que ENTRA al cajón sin ser una venta
    'sale',           -- venta cobrada en efectivo (posts_cash, desde la 108)
    'caja_chica',     -- gasto menor pagado con el efectivo del cajón
    'retiro',         -- retiro del titular
    'pago_proveedor', -- pago a un proveedor en efectivo
    'arqueo'          -- ajuste de arqueo: contado vs. sistema
  )),

  -- POR QUÉ EXISTE `aporte`, y por qué no estaba en el diseño.
  --
  -- Sin él, los otros cuatro tipos que este módulo puede cargar son TODOS de
  -- salida: `caja_chica`, `retiro` y `pago_proveedor` sacan del cajón, y
  -- `arqueo` solo refleja una diferencia de conteo. `sale` entra, pero la
  -- emite Ventas (slice 4) y la lista blanca de `record_cash_movement()` la
  -- excluye a propósito.
  --
  -- Resultado: el saldo arrancaba en cero, cualquier movimiento posible lo
  -- dejaba en negativo, el guardián ERP02 lo rechazaba, y Caja quedaba
  -- inutilizable hasta que existiera Ventas. Eso contradice la decisión de
  -- producto que sostiene este slice: la caja tiene libro propio JUSTAMENTE
  -- para servir antes de que haya algo que vender.
  --
  -- `aporte` es el fondo de caja: la plata que el titular pone para tener
  -- cambio a la mañana. Toda caja real empieza por ahí. También cubre una
  -- reposición y una devolución de proveedor en efectivo.
  --
  -- Lo encontró la suite de RLS al correrse: siete pruebas fallaban con
  -- ERP02 porque intentaban sacar de un cajón que nunca podía tener nada.
  -- Cero está prohibido en general (un movimiento de cero no es un
  -- movimiento, mismo criterio que `stock_movements.quantity`, 101) salvo
  -- para el arqueo: un arqueo que cuadra (contado = sistema) igual se
  -- registra, porque el requerimiento del módulo es dejar constancia de que
  -- el arqueo se hizo, no solo de las diferencias.
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0 OR kind = 'arqueo'),

  -- Solo para `kind = 'arqueo'`: contado − sistema, la misma diferencia que
  -- `amount_cents` aplica al cajón. Se reutiliza `NUMERIC(12,3)` por
  -- consistencia con el resto del schema, aunque acá la magnitud real siempre
  -- es un entero de centavos.
  quantity NUMERIC(12,3),

  note TEXT,

  -- Un movimiento NO se borra ni se edita: se anula con un contrasiento.
  -- Misma regla que `erp.stock_movements` (101) — es la razón por la que
  -- abajo no hay política de UPDATE ni de DELETE.
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
  voids_movement_id UUID REFERENCES erp.cash_movements(id) ON DELETE SET NULL,

  created_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- El arqueo necesita explicar la diferencia siempre que la haya: un arqueo
  -- que cuadra (contado = sistema) no obliga a nadie a inventar un motivo.
  CONSTRAINT chk_arqueo_con_nota CHECK (
    kind <> 'arqueo' OR quantity = 0 OR (note IS NOT NULL AND length(trim(note)) > 0)
  )
);

CREATE INDEX idx_erp_cash_movements_institution ON erp.cash_movements(institution_id);
CREATE INDEX idx_erp_cash_movements_account ON erp.cash_movements(cash_account_id);
CREATE INDEX idx_erp_cash_movements_sale ON erp.cash_movements(sale_id);
CREATE INDEX idx_erp_cash_movements_voided_by ON erp.cash_movements(voided_by);
CREATE INDEX idx_erp_cash_movements_voids ON erp.cash_movements(voids_movement_id);
CREATE INDEX idx_erp_cash_movements_created_by ON erp.cash_movements(created_by);

-- El libro de una institución, más nuevo primero: es la consulta de la
-- pantalla de Caja.
CREATE INDEX idx_erp_cash_movements_institucion_fecha
  ON erp.cash_movements(institution_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- erp.apply_cash_movement — el único que escribe `cash_accounts.balance_cents`
--
-- Copia independiente de `erp.apply_movement()` (101:164-177), no una versión
-- parametrizada — ver la razón en design.md: una función genérica sobre
-- identificadores de tabla dinámicos es la peor construcción para auditar,
-- justo en el schema cuya razón de ser es una frontera de permisos dura.
--
-- BEFORE y no AFTER, a diferencia de `apply_movement()`: acá el trigger
-- también es el que RECHAZA el movimiento si dejaría la caja en negativo —
-- estricto desde el primer día (decisión 4, la 101/102 son la evidencia de
-- por qué no conviene ser permisivo primero y corregir después). `FOR UPDATE`
-- sobre la fila del cajón evita que dos salidas concurrentes lean el mismo
-- saldo y las dos pasen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.apply_cash_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT balance_cents INTO v_balance
    FROM erp.cash_accounts
   WHERE id = NEW.cash_account_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La caja no existe' USING ERRCODE = 'no_data_found';
  END IF;

  -- Un contrasiento nunca se bloquea, mismo criterio que
  -- `check_stock_suficiente()` (102): anular tiene que poder ejecutarse
  -- siempre, o el libro no tendría forma de corregir un error de carga.
  IF NEW.voids_movement_id IS NULL AND v_balance + NEW.amount_cents < 0 THEN
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
  'Único escritor de cash_accounts.balance_cents. Bloquea el INSERT si '
  'dejaría la caja en negativo (SQLSTATE ERP02), salvo contrasientos.';

CREATE TRIGGER erp_cash_movements_apply
  BEFORE INSERT ON erp.cash_movements
  FOR EACH ROW EXECUTE FUNCTION erp.apply_cash_movement();

-- ----------------------------------------------------------------------------
-- erp.void_cash_movement — anular con contrasiento
--
-- Copia independiente de `erp.void_movement()` (101:192-248). Misma forma:
-- marca el original como anulado e inserta su espejo, las dos cosas en una
-- función para que una falla de red entre medio no descuadre el libro.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.void_cash_movement(
  p_movement_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_original erp.cash_movements;
  v_professional_id UUID;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_original
    FROM erp.cash_movements
   WHERE id = p_movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento no existe' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT erp.has_access(v_original.institution_id, 'caja') THEN
    RAISE EXCEPTION 'Sin acceso a Caja' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_original.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ese movimiento ya estaba anulado' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Un contrasiento tampoco se anula: mismo motivo que `void_movement()`
  -- (101) — encadenar anulaciones de anulaciones vuelve el libro imposible
  -- de leer.
  IF v_original.voids_movement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un contrasiento no se anula' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_professional_id := public.my_vet_professional_id();

  UPDATE erp.cash_movements
     SET voided_at = now(),
         voided_by = v_professional_id
   WHERE id = p_movement_id;

  INSERT INTO erp.cash_movements (
    institution_id, cash_account_id, sale_id, kind, amount_cents,
    quantity, note, voids_movement_id, created_by
  ) VALUES (
    v_original.institution_id,
    v_original.cash_account_id,
    v_original.sale_id,
    v_original.kind,
    -v_original.amount_cents,
    v_original.quantity,
    COALESCE(p_reason, 'Anulación'),
    p_movement_id,
    v_professional_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.void_cash_movement(UUID, TEXT) IS
  'Anula un movimiento de caja insertando el contrasiento inverso. Rechaza '
  'anular un contrasiento o un movimiento ya anulado. Exige '
  'erp.has_access(institution_id, ''caja'').';

REVOKE EXECUTE ON FUNCTION erp.void_cash_movement(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION erp.void_cash_movement(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- erp.record_cash_movement — caja chica, retiro, pago a proveedor, arqueo
--
-- `SECURITY DEFINER` por la misma razón que `erp.register_purchase()` (105):
-- necesita crear o resolver la cuenta de caja de la institución antes de
-- insertar, y el control de acceso lo hace ella misma en la primera línea.
--
-- El movimiento de una venta en efectivo (`kind = 'sale'`) NO pasa por acá:
-- lo emite `erp.register_sale()` (108), que ya conoce la institución y el
-- profesional de la venta. Esta función es para los movimientos que un
-- humano carga directo desde la pantalla de Caja.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.record_cash_movement(
  p_kind TEXT,
  p_amount_cents BIGINT,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_institution_id UUID;
  v_account_id UUID;
  v_professional_id UUID;
  v_new_id UUID;
BEGIN
  v_institution_id := erp.my_institution_id();

  IF NOT erp.has_access(v_institution_id, 'caja') THEN
    RAISE EXCEPTION 'Sin acceso a Caja' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('aporte', 'caja_chica', 'retiro', 'pago_proveedor') THEN
    RAISE EXCEPTION 'Ese tipo de movimiento no se carga desde acá'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- La cuenta de caja se crea perezosamente en el primer movimiento: no hay
  -- un flujo de "alta de institución" que la siembre, y una institución
  -- nueva no tiene por qué tener una fila en `cash_accounts` hasta que algo
  -- efectivamente mueva su cajón.
  INSERT INTO erp.cash_accounts (institution_id)
  VALUES (v_institution_id)
  ON CONFLICT (institution_id) DO NOTHING;

  SELECT id INTO v_account_id
    FROM erp.cash_accounts
   WHERE institution_id = v_institution_id;

  v_professional_id := public.my_vet_professional_id();

  INSERT INTO erp.cash_movements (
    institution_id, cash_account_id, kind, amount_cents, note, created_by
  ) VALUES (
    v_institution_id, v_account_id, p_kind, p_amount_cents, p_note, v_professional_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.record_cash_movement(TEXT, BIGINT, TEXT) IS
  'Carga caja chica, retiro del titular o pago a proveedor. La venta en '
  'efectivo la emite erp.register_sale() (108), no esta función. Exige '
  'erp.has_access(institution_id, ''caja'').';

REVOKE EXECUTE ON FUNCTION erp.record_cash_movement(TEXT, BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION erp.record_cash_movement(TEXT, BIGINT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- erp.record_arqueo — contado vs. sistema
--
-- Decisión 1 del diseño: el arqueo es una fila, no un candado. No hay estado
-- de "turno cerrado" que impida cargar una venta después — el próximo
-- movimiento simplemente se suma a partir de este saldo, igual que cualquier
-- otro. `p_reason` es obligatorio cuando hay diferencia (`chk_arqueo_con_nota`
-- de la tabla ya lo exige a nivel de constraint; acá se valida antes para dar
-- un mensaje legible en vez de un error crudo de CHECK).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.record_arqueo(
  p_counted_cents BIGINT,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_institution_id UUID;
  v_account_id UUID;
  v_professional_id UUID;
  v_system_cents BIGINT;
  v_difference BIGINT;
  v_new_id UUID;
BEGIN
  v_institution_id := erp.my_institution_id();

  IF NOT erp.has_access(v_institution_id, 'caja') THEN
    RAISE EXCEPTION 'Sin acceso a Caja' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO erp.cash_accounts (institution_id)
  VALUES (v_institution_id)
  ON CONFLICT (institution_id) DO NOTHING;

  SELECT id, balance_cents INTO v_account_id, v_system_cents
    FROM erp.cash_accounts
   WHERE institution_id = v_institution_id
     FOR UPDATE;

  v_difference := p_counted_cents - v_system_cents;

  IF v_difference <> 0 AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'Un arqueo con diferencia necesita un motivo'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_professional_id := public.my_vet_professional_id();

  -- Siempre se inserta, cuadre o no: el requerimiento es dejar constancia de
  -- que el arqueo se hizo. `amount_cents = 0` está permitido para
  -- `kind = 'arqueo'` (ver el CHECK de la tabla) y el trigger de saldo no
  -- mueve nada cuando la diferencia es cero.
  INSERT INTO erp.cash_movements (
    institution_id, cash_account_id, kind, amount_cents, quantity, note, created_by
  ) VALUES (
    v_institution_id, v_account_id, 'arqueo', v_difference, v_difference,
    p_reason, v_professional_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.record_arqueo(BIGINT, TEXT) IS
  'Registra contado vs. sistema. Inserta un movimiento kind=arqueo solo si '
  'hay diferencia; motivo obligatorio en ese caso. No bloquea nada después. '
  'Exige erp.has_access(institution_id, ''caja'').';

REVOKE EXECUTE ON FUNCTION erp.record_arqueo(BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION erp.record_arqueo(BIGINT, TEXT) TO authenticated;

-- ============================================================================
-- Permisos y RLS — plantilla de la 100, gateadas por el módulo 'caja'
-- ============================================================================

-- Solo SELECT para `authenticated`: el saldo lo escribe exclusivamente el
-- trigger `erp_cash_movements_apply`, nunca un UPDATE directo del cliente —
-- mismo criterio que `products.stock` no tiene política de UPDATE que lo
-- alcance desde afuera de `erp.apply_movement()` (101), salvo que acá se hace
-- explícito con la ausencia total de política de UPDATE.
GRANT SELECT ON erp.cash_accounts TO authenticated;
ALTER TABLE erp.cash_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_accounts_select" ON erp.cash_accounts FOR SELECT
  USING (erp.has_access(institution_id, 'caja'));

-- Sin INSERT/UPDATE/DELETE para `authenticated`: la fila la crea
-- perezosamente `record_cash_movement()` / `record_arqueo()`
-- (`SECURITY DEFINER`), y la actualiza solo el trigger. Ningún camino de
-- escritura directa tiene por qué existir.

GRANT SELECT, INSERT ON erp.cash_movements TO authenticated;
ALTER TABLE erp.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_movements_select" ON erp.cash_movements FOR SELECT
  USING (erp.has_access(institution_id, 'caja'));

-- El INSERT directo por `authenticated` queda habilitado por completitud de
-- la plantilla (mismo criterio que `erp.purchases`, 105), pero el camino real
-- es `record_cash_movement()` / `record_arqueo()` / `void_cash_movement()`,
-- que además disparan el trigger de saldo con la autoridad de la función.
CREATE POLICY "cash_movements_insert" ON erp.cash_movements FOR INSERT
  WITH CHECK (erp.has_access(institution_id, 'caja'));

-- Sin UPDATE ni DELETE: el libro de caja es append-only, igual que
-- `erp.stock_movements` (101). Corregir un movimiento cargado mal es
-- anularlo con `void_cash_movement()` y cargar uno nuevo.
