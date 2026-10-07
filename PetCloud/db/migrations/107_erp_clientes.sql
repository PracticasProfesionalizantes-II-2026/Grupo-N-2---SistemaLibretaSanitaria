-- ============================================================================
-- PetCloud ERP — Migración 107: clientes + cuenta corriente
--
-- Cuarto módulo de negocio del ERP. Depende de `erp.has_access(institution_id,
-- module)` (104) para el gate de acceso, y de `erp.apply_cash_movement()`
-- (106) para el pago sobre cuenta — es la primera escritura cruzada entre dos
-- libros del ERP.
--
-- LA TRAMPA DE ESTE MÓDULO, dicha en voz alta para que nadie la repita:
-- Stock bloquea negativo (ERP01, 102). Caja bloquea negativo (ERP02, 106).
-- La cuenta corriente NO. Un saldo negativo acá es legítimo — significa que
-- la veterinaria le debe plata al cliente (una seña, un saldo a favor, un
-- pago de más). Las tres estructuras son idénticas a propósito (mismo patrón
-- que 101/106), y por eso el reflejo natural es copiar la guarda de signo.
-- Sería un error: `erp.apply_account_movement()` de acá abajo NO tiene
-- ningún `ERP0x` sobre el signo del saldo, y es intencional. Si alguien lee
-- esto pensando en "arreglarlo", que lea primero
-- `erp-customer-accounts/spec.md` — el requerimiento "negative balance is
-- valid and MUST NOT be blocked" es tan explícito como el que bloquea a los
-- otros dos libros.
--
-- MÓDULO ELEGIDO PARA EL GATE: 'ventas', no 'clientes' — ese token no existe
-- en el vocabulario de permisos (104 solo define
-- 'stock','ventas','caja','compras','reportes','equipo'). El diseño ya fija
-- esto: Clientes y Ventas comparten módulo porque el cliente es un dato de
-- Ventas (decisión 5 — "nadie pierde lo que ya tenía": Stock y Ventas están
-- abiertos a cualquier miembro Premium desde el día uno, sin fila en
-- `module_grants`).
--
-- POR QUÉ HAY UN MOVIMIENTO 'ajuste' Y CÓMO SE CARGA. Sin él, el único
-- generador de deuda sería `kind = 'sale'` — que todavía no puede emitir
-- nadie, porque `erp.register_sale()` llega en la 108. Repetir el agujero
-- que la 106 encontró (todo lo que este módulo podía cargar era salida, así
-- que el saldo nunca podía dejar cero) sería exactamente ese error, solo que
-- acá ni siquiera haría falta un guardián de signo para notarlo: el problema
-- sería que la pantalla de Clientes no tendría NADA que hacer hasta que
-- exista Ventas. `ajuste` es la entrada manual — carga de saldo inicial de un
-- cliente que ya tenía cuenta corriente en papel, o una corrección — y se
-- inserta DIRECTO contra la tabla (política de INSERT de más abajo), mismo
-- criterio que `erp.stock_movements` acepta un INSERT directo del cliente
-- (101) en lugar de forzar todo a pasar por una función. `sale` queda en el
-- CHECK desde ya (para que la 108 no tenga que tocar esta tabla) pero nada en
-- este slice lo ofrece desde la pantalla — igual que `cash_movements.kind`
-- tiene 'sale' desde la 106 sin que nada lo emita todavía.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- erp.customers — ficha comercial/fiscal, independiente de `public.profiles`
--
-- `profile_id` es el vínculo OPCIONAL a un usuario de PetCloud, usado solo
-- para prefill de datos (nombre, teléfono, domicilio) desde la pantalla de
-- alta — nunca para escribir en `public`. La política ya existente
-- `profiles_select_by_vet` (012_visit_summary_and_owner_contact.sql:70-97)
-- deja leer esos campos a un veterinario cuya institución atendió a una
-- mascota de ese dueño; el ERP hereda esa lectura bajo la misma sesión, sin
-- agregar ni una política nueva sobre `public.profiles`. Este archivo no toca
-- ese schema en ninguna línea.
--
-- `credit_limit_cents` es NULL por defecto (sin límite) y solo se SURFACEA,
-- nunca se aplica — ver el comentario de `apply_account_movement()` más
-- abajo para la razón completa.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,

  -- Vínculo opcional a un usuario de PetCloud. `ON DELETE SET NULL`: si el
  -- perfil desaparece, la ficha comercial de la veterinaria queda intacta —
  -- es un registro propio del ERP, no un espejo de `public.profiles`.
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  razon_social TEXT NOT NULL CHECK (length(trim(razon_social)) > 0),

  tipo_documento TEXT NOT NULL CHECK (tipo_documento IN (
    'dni', 'cuit', 'cuil', 'pasaporte', 'sin_documento'
  )),
  numero_documento TEXT,

  condicion_iva TEXT NOT NULL CHECK (condicion_iva IN (
    'consumidor_final', 'responsable_inscripto', 'monotributista',
    'exento', 'no_alcanzado'
  )),

  domicilio TEXT,
  email TEXT,
  phone TEXT,

  -- Surfaceado, nunca aplicado — ver `apply_account_movement()`. NULL es el
  -- default y significa "sin límite".
  credit_limit_cents BIGINT,

  -- CACHÉ del libro de `erp.account_movements`, misma regla que
  -- `erp.products.stock` (101) y `erp.cash_accounts.balance_cents` (106): lo
  -- escribe únicamente `erp.apply_account_movement()`. A diferencia de esos
  -- dos, acá negativo es un valor válido — no hay guardián de signo.
  balance_cents BIGINT NOT NULL DEFAULT 0,

  active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Postgres NO indexa el lado hijo de una FK (100:118-119).
CREATE INDEX idx_erp_customers_institution ON erp.customers(institution_id);
CREATE INDEX idx_erp_customers_profile ON erp.customers(profile_id);

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON erp.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- erp.account_movements — el libro de cuenta corriente
--
-- Misma forma que `erp.stock_movements` (101) y `erp.cash_movements` (106):
-- signo en `amount_cents`, positivo suma deuda, negativo la reduce. `sale_id`
-- queda NULL en este slice — `erp.sales` todavía no existe, llega en la 108,
-- que solo tiene que agregar la FK y el trigger de ruteo (`posts_account`),
-- no reescribir la tabla. Mismo criterio que `cash_movements.sale_id` en la
-- 106.
-- ----------------------------------------------------------------------------
CREATE TABLE erp.account_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.vet_institutions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES erp.customers(id) ON DELETE CASCADE,

  -- FK a `erp.sales` se agrega en la 108, cuando esa tabla exista.
  sale_id UUID,

  kind TEXT NOT NULL CHECK (kind IN (
    'sale',    -- deuda por una venta en cuenta corriente (la emite la 108)
    'payment', -- pago que cancela deuda, emitido por register_account_payment
    'ajuste'   -- carga manual: saldo inicial o corrección
  )),

  -- Cero no es un movimiento — mismo criterio que `stock_movements.quantity`
  -- y `cash_movements.amount_cents` (sin la excepción de arqueo: acá no hay
  -- equivalente, todo movimiento tiene que mover algo).
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),

  note TEXT,

  -- Un movimiento no se borra ni se edita: se anula con un contrasiento.
  -- Misma regla que los otros dos libros — es la razón por la que abajo no
  -- hay política de UPDATE ni de DELETE.
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
  voids_movement_id UUID REFERENCES erp.account_movements(id) ON DELETE SET NULL,

  created_by UUID REFERENCES public.vet_professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_account_movements_institution ON erp.account_movements(institution_id);
CREATE INDEX idx_erp_account_movements_customer ON erp.account_movements(customer_id);
CREATE INDEX idx_erp_account_movements_sale ON erp.account_movements(sale_id);
CREATE INDEX idx_erp_account_movements_voided_by ON erp.account_movements(voided_by);
CREATE INDEX idx_erp_account_movements_voids ON erp.account_movements(voids_movement_id);
CREATE INDEX idx_erp_account_movements_created_by ON erp.account_movements(created_by);

-- El estado de cuenta de un cliente, más nuevo primero: la consulta de la
-- pantalla de Clientes.
CREATE INDEX idx_erp_account_movements_cliente_fecha
  ON erp.account_movements(customer_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- erp.apply_account_movement — el único que escribe `customers.balance_cents`
--
-- Copia independiente de `erp.apply_movement()` (101) / `apply_cash_movement()`
-- (106) — ver design.md para la razón de no parametrizar las tres. `FOR
-- UPDATE` sobre la fila del cliente serializa dos movimientos concurrentes
-- del mismo cliente, igual que el cajón (106) y el producto (102).
--
-- LO QUE ESTA FUNCIÓN A PROPÓSITO **NO** HACE: no rechaza un saldo negativo.
-- Stock (102) y Caja (106) sí lo hacen porque negativo ahí es un error de
-- carga o una imposibilidad física. Acá negativo es un cliente al que la
-- veterinaria le debe plata — una seña, un saldo a favor, un pago de más — y
-- es tan legítimo como positivo. Ningún `ERP0x` vive en esta función ni va a
-- vivir nunca: si alguien agrega uno "para ser consistente con Caja", está
-- rompiendo el requerimiento de `erp-customer-accounts/spec.md` que dice lo
-- contrario en texto explícito.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.apply_account_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_existe BOOLEAN;
BEGIN
  SELECT true INTO v_existe
    FROM erp.customers
   WHERE id = NEW.customer_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El cliente no existe' USING ERRCODE = 'no_data_found';
  END IF;

  -- Sin guardián de signo — ver el comentario de arriba. El saldo se mueve
  -- siempre, cualquiera sea el resultado.
  UPDATE erp.customers
     SET balance_cents = balance_cents + NEW.amount_cents
   WHERE id = NEW.customer_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.apply_account_movement() IS
  'Único escritor de customers.balance_cents. A diferencia de '
  'apply_movement() (101) y apply_cash_movement() (106), NO bloquea saldo '
  'negativo: acá es un saldo a favor del cliente, un resultado legítimo.';

CREATE TRIGGER erp_account_movements_apply
  BEFORE INSERT ON erp.account_movements
  FOR EACH ROW EXECUTE FUNCTION erp.apply_account_movement();

-- ----------------------------------------------------------------------------
-- erp.void_account_movement — anular con contrasiento
--
-- Copia independiente de `erp.void_cash_movement()` (106) / `void_movement()`
-- (101). Mismas reglas de rechazo: no se anula un contrasiento, no se anula
-- dos veces.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.void_account_movement(
  p_movement_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_original erp.account_movements;
  v_professional_id UUID;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_original
    FROM erp.account_movements
   WHERE id = p_movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento no existe' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT erp.has_access(v_original.institution_id, 'ventas') THEN
    RAISE EXCEPTION 'Sin acceso a Clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_original.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ese movimiento ya estaba anulado' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_original.voids_movement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un contrasiento no se anula' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_professional_id := public.my_vet_professional_id();

  UPDATE erp.account_movements
     SET voided_at = now(),
         voided_by = v_professional_id
   WHERE id = p_movement_id;

  INSERT INTO erp.account_movements (
    institution_id, customer_id, sale_id, kind, amount_cents,
    note, voids_movement_id, created_by
  ) VALUES (
    v_original.institution_id,
    v_original.customer_id,
    v_original.sale_id,
    v_original.kind,
    -v_original.amount_cents,
    COALESCE(p_reason, 'Anulación'),
    p_movement_id,
    v_professional_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.void_account_movement(UUID, TEXT) IS
  'Anula un movimiento de cuenta corriente insertando el contrasiento '
  'inverso. Rechaza anular un contrasiento o un movimiento ya anulado. '
  'Exige erp.has_access(institution_id, ''ventas'').';

REVOKE EXECUTE ON FUNCTION erp.void_account_movement(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION erp.void_account_movement(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- `erp.cash_movements.kind` — se amplía para el pago sobre cuenta
--
-- El pago que cancela deuda pone plata en el cajón, pero no es 'aporte'
-- (fondo de caja que pone el titular) ni 'sale' (una venta cobrada en
-- efectivo, que trae su propio `sale_id` desde la 108) ni 'caja_chica' (un
-- gasto, o sea que SALE del cajón — usarlo para una entrada sería mentirle a
-- quien lea el libro más tarde). Se agrega un valor propio, 'cobro_cta_cte',
-- en lugar de forzar uno existente. La tabla ya está aplicada como parte de
-- la 106 en el orden de esta serie, así que se amplía el CHECK acá — el
-- archivo `106_erp_caja.sql` no se edita (append-only), esto es una
-- migración nueva que actúa sobre una tabla existente.
-- ----------------------------------------------------------------------------
ALTER TABLE erp.cash_movements DROP CONSTRAINT cash_movements_kind_check;
ALTER TABLE erp.cash_movements ADD CONSTRAINT cash_movements_kind_check
  CHECK (kind IN (
    'aporte', 'sale', 'caja_chica', 'retiro', 'pago_proveedor', 'arqueo',
    'cobro_cta_cte'
  ));

-- ----------------------------------------------------------------------------
-- erp.register_account_payment — pago sobre cuenta: cancela deuda y entra al cajón
--
-- Primera escritura cruzada entre dos libros del ERP. `SECURITY DEFINER`
-- porque PostgREST no da transacción entre llamadas (design.md, misma razón
-- que `erp.register_purchase()`, 105): sin esto, una caída de red entre el
-- INSERT de `account_movements` y el de `cash_movements` dejaría la deuda
-- cancelada sin que el cajón lo reciba, o viceversa.
--
-- Se valida `erp.has_access(institution_id, 'ventas')` en la primera línea —
-- un pago sobre cuenta es una acción adyacente a Ventas (decisión del
-- diseño: "cuenta corriente modelada como un método de pago"), no una acción
-- de Caja: quien puede cobrar en cuenta corriente puede recibir el pago que
-- la cancela, tenga o no delegado el módulo 'caja' por separado.
--
-- OJO — RLS nunca corre adentro de un `SECURITY DEFINER`: un `FOREIGN KEY`
-- prueba que el cliente EXISTE, no que sea DE ESTA institución (mismo
-- comentario que `erp.register_purchase()`, 105:145-151). La comprobación de
-- abajo está escrita a mano por eso.
--
-- ORDEN DE LOCKS: cliente antes que cajón (design.md — "products ASC →
-- customers → cash_accounts"), el mismo orden fijo en todo el ERP para que
-- dos transacciones concurrentes nunca se traben en el orden contrario.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.register_account_payment(p_payload JSONB)
RETURNS UUID AS $$
DECLARE
  v_institution_id UUID;
  v_professional_id UUID;
  v_customer_id UUID;
  v_amount_cents BIGINT;
  v_account_id UUID;
  v_payment_id UUID;
BEGIN
  v_institution_id := erp.my_institution_id();

  IF NOT erp.has_access(v_institution_id, 'ventas') THEN
    RAISE EXCEPTION 'Sin acceso a Clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_customer_id := (p_payload ->> 'customer_id')::UUID;
  v_amount_cents := (p_payload ->> 'amount_cents')::BIGINT;

  IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
    RAISE EXCEPTION 'El monto del pago tiene que ser mayor que cero'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- El cliente tiene que ser DE ESTA institución. Un FK a erp.customers no
  -- alcanza: SECURITY DEFINER ve todas las filas de la tabla, no solo las
  -- que RLS le dejaría ver a quien llama.
  IF NOT EXISTS (
    SELECT 1 FROM erp.customers
     WHERE id = v_customer_id
       AND institution_id = v_institution_id
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece a esta institución'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_professional_id := public.my_vet_professional_id();

  -- 1) Deuda abajo: monto negativo, mismo criterio de signo que cualquier
  --    otro movimiento que reduce el saldo.
  INSERT INTO erp.account_movements (
    institution_id, customer_id, kind, amount_cents, note, created_by
  ) VALUES (
    v_institution_id, v_customer_id, 'payment', -v_amount_cents,
    p_payload ->> 'note', v_professional_id
  )
  RETURNING id INTO v_payment_id;

  -- 2) Cajón arriba: la cuenta de caja se crea perezosamente igual que en
  --    `record_cash_movement()` (106) — una institución nueva puede no tener
  --    fila todavía en `cash_accounts`.
  INSERT INTO erp.cash_accounts (institution_id)
  VALUES (v_institution_id)
  ON CONFLICT (institution_id) DO NOTHING;

  SELECT id INTO v_account_id
    FROM erp.cash_accounts
   WHERE institution_id = v_institution_id;

  INSERT INTO erp.cash_movements (
    institution_id, cash_account_id, kind, amount_cents, note, created_by
  ) VALUES (
    v_institution_id, v_account_id, 'cobro_cta_cte', v_amount_cents,
    p_payload ->> 'note', v_professional_id
  );

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

COMMENT ON FUNCTION erp.register_account_payment(JSONB) IS
  'Pago sobre cuenta corriente: cancela deuda (account_movements, '
  'kind=payment) y entra al cajón (cash_movements, kind=cobro_cta_cte) en '
  'una transacción. Exige erp.has_access(institution_id, ''ventas''). '
  'Depende de erp.apply_cash_movement() (106).';

REVOKE EXECUTE ON FUNCTION erp.register_account_payment(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION erp.register_account_payment(JSONB) TO authenticated;

-- ============================================================================
-- Permisos y RLS — plantilla de la 100, gateadas por el módulo 'ventas'
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON erp.customers TO authenticated;
ALTER TABLE erp.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select" ON erp.customers FOR SELECT
  USING (erp.has_access(institution_id, 'ventas'));

CREATE POLICY "customers_insert" ON erp.customers FOR INSERT
  WITH CHECK (erp.has_access(institution_id, 'ventas'));

-- UPDATE habilitado para corregir el límite de crédito y los datos fiscales
-- (decisión 5 / task 3.1.7). `balance_cents` queda alcanzable por este UPDATE
-- a nivel de columna GRANT, pero solo lo escribe en la práctica
-- `apply_account_movement()` — no hay flujo de aplicación que lo toque
-- directo, mismo criterio que `products.stock` en la 101.
CREATE POLICY "customers_update" ON erp.customers FOR UPDATE
  USING (erp.has_access(institution_id, 'ventas'))
  WITH CHECK (erp.has_access(institution_id, 'ventas'));

-- Sin DELETE: un cliente se desactiva (`active = false`), no se borra —
-- mismo criterio que el resto del schema.

GRANT SELECT, INSERT ON erp.account_movements TO authenticated;
ALTER TABLE erp.account_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_movements_select" ON erp.account_movements FOR SELECT
  USING (erp.has_access(institution_id, 'ventas'));

-- El INSERT directo alcanza para cargar un 'ajuste' desde la pantalla de
-- Clientes (ver el comentario grande del encabezado). Se agrega, además del
-- gate de módulo, que el cliente sea DE ESTA institución: a diferencia de un
-- `SECURITY DEFINER`, acá SÍ corre RLS en cada INSERT, así que conviene
-- cerrar también esta puerta a nivel de política y no confiar solo en que la
-- aplicación mande el `customer_id` correcto.
CREATE POLICY "account_movements_insert" ON erp.account_movements FOR INSERT
  WITH CHECK (
    erp.has_access(institution_id, 'ventas')
    AND EXISTS (
      SELECT 1 FROM erp.customers c
       WHERE c.id = customer_id
         AND c.institution_id = account_movements.institution_id
    )
  );

-- Sin UPDATE ni DELETE: el libro de cuenta corriente es append-only, igual
-- que los otros dos. Corregir un movimiento cargado mal es anularlo con
-- `void_account_movement()` y cargar uno nuevo.
