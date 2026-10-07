-- ============================================================================
-- PetCloud ERP — Migración 112: el aislamiento entre veterinarias lo garantiza
-- el motor, no una política
--
-- LO QUE ESTABA ROTO
--
-- La plantilla de RLS de la 100 —la que el README del módulo manda copiar "tal
-- cual"— valida `institution_id` y nada más:
--
--   CREATE POLICY "<tabla>_insert" ON erp.<tabla> FOR INSERT
--     WITH CHECK (erp.has_access(institution_id));
--
-- No ata las claves foráneas a esa institución. Y una FK se valida como dueño
-- de la tabla, **ignorando RLS**, así que acepta la fila padre de cualquiera.
--
-- Demostrado contra el stack local, con una veterinaria legítima y con Premium
-- activo: inserta un movimiento con SU `institution_id` y el `product_id` de
-- otra. El INSERT pasa, el stock ajeno se mueve de 50 a 1049, y el mensaje de
-- error le devuelve el nombre y el stock exactos de ese producto:
--
--   Stock insuficiente de "Vacuna-Secreta-De-A": hay 1049.000 y estás sacando 999999.000.
--
-- Y la víctima no se entera: la fila queda con el `institution_id` del atacante,
-- así que su propia política de SELECT no se la muestra. Ve su stock cambiar sin
-- una sola línea en el libro que lo explique — lo contrario exacto de lo que el
-- README del módulo declara como el producto.
--
-- Once de las catorce FK internas del schema comparten el defecto. La única que
-- lo hace bien es `account_movements_insert` (107), que compara
-- `c.institution_id = account_movements.institution_id`. El patrón correcto
-- estaba escrito una vez y copiado cero.
--
-- POR QUÉ UNA FK COMPUESTA Y NO OTRA POLÍTICA
--
-- Agregarle un `EXISTS` a cada política de INSERT es exactamente lo que el
-- schema debería haber hecho, y es la razón por la que solo 1 de 14 claves está
-- sana: depende de que una persona escriba la cláusula en cada tabla nueva, y
-- ocho veces nadie lo hizo. La FK es declarativa, la heredan todas las filas
-- futuras, y queda visible en `pg_constraint` — que es lo que hace posible el
-- test de invariantes que impide la recaída.
--
-- LA RLS NO SE TOCA, A PROPÓSITO. Responde "¿puede este llamante escribir para
-- esta institución?", que es otra pregunta que "¿esta fila pertenece a esa
-- institución?". Confundir las dos es como nació este defecto.
--
-- LO QUE LA FK NO ALCANZA A CERRAR
--
-- Postgres evalúa la integridad referencial como un constraint trigger AFTER
-- ROW. `erp_movements_check_stock` es BEFORE INSERT (102:82-84), así que corre
-- ANTES y puede leer —y filtrar— la fila ajena antes de que la FK la rechace.
-- Verificado: un INSERT con un `product_id` inexistente devuelve
-- `El producto no existe` del trigger, no un SQLSTATE 23503. La FK ni corre.
--
-- Por eso esta migración también reemplaza tres cuerpos de función. Con las
-- claves compuestas solas, el tercer test del PoC seguiría en rojo, y con razón.
--
-- ANTES DE APLICAR (manual, del maintainer): las dos consultas de pre-vuelo del
-- diseño deben dar CERO. La primera busca filas que ya cruzan instituciones; la
-- segunda, ítems huérfanos que impedirían el backfill. Si la primera devuelve
-- algo, esas filas son evidencia: se borran a conciencia o se mueven, pero nunca
-- se deja que `ADD CONSTRAINT` decida por nosotros.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · El destino que la FK compuesta necesita
--
-- Una FK compuesta exige una restricción única sobre exactamente esas columnas
-- en el padre. `id` ya es PRIMARY KEY; el par `(id, institution_id)` es
-- redundante en términos de unicidad —si `id` es único, el par también— y ese
-- es justamente el punto: no agrega una regla nueva, agrega un destino al que
-- la hija pueda apuntar arrastrando la institución consigo.
-- ----------------------------------------------------------------------------
ALTER TABLE erp.products
  ADD CONSTRAINT products_id_institution_key UNIQUE (id, institution_id);
ALTER TABLE erp.stock_movements
  ADD CONSTRAINT stock_movements_id_institution_key UNIQUE (id, institution_id);
ALTER TABLE erp.suppliers
  ADD CONSTRAINT suppliers_id_institution_key UNIQUE (id, institution_id);
ALTER TABLE erp.purchases
  ADD CONSTRAINT purchases_id_institution_key UNIQUE (id, institution_id);
ALTER TABLE erp.cash_accounts
  ADD CONSTRAINT cash_accounts_id_institution_key UNIQUE (id, institution_id);
ALTER TABLE erp.cash_movements
  ADD CONSTRAINT cash_movements_id_institution_key UNIQUE (id, institution_id);
ALTER TABLE erp.customers
  ADD CONSTRAINT customers_id_institution_key UNIQUE (id, institution_id);
ALTER TABLE erp.account_movements
  ADD CONSTRAINT account_movements_id_institution_key UNIQUE (id, institution_id);
ALTER TABLE erp.sales
  ADD CONSTRAINT sales_id_institution_key UNIQUE (id, institution_id);

-- ----------------------------------------------------------------------------
-- 2 · Las dos tablas hijas que heredaban la institución del padre
--
-- `erp.purchase_items` y `erp.sale_items` nacieron sin `institution_id`: la
-- sacaban de su compra o su venta con un JOIN. Eso funcionaba para leer, pero
-- deja su `product_id` sin nada a qué atarlo — y una línea de venta mía con el
-- producto de otra veterinaria es el mismo agujero en versión chica.
--
-- Se denormaliza. Tener el tenant en cada tabla es la práctica habitual en
-- multi-tenant justamente por esto: mantiene las políticas sin JOIN y permite
-- que la FK compuesta sea el estándar de todo el esquema, no una excepción que
-- alguien decide tabla por tabla.
--
-- EL ORDEN NO ES ESTILO. El backfill va antes del `SET NOT NULL`: al revés, el
-- ALTER falla contra cualquier fila que ya exista.
-- ----------------------------------------------------------------------------
ALTER TABLE erp.purchase_items ADD COLUMN institution_id UUID;

UPDATE erp.purchase_items i
   SET institution_id = p.institution_id
  FROM erp.purchases p
 WHERE p.id = i.purchase_id;

ALTER TABLE erp.purchase_items ALTER COLUMN institution_id SET NOT NULL;

ALTER TABLE erp.purchase_items
  ADD CONSTRAINT purchase_items_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.vet_institutions(id) ON DELETE CASCADE;

-- Postgres no indexa el lado hijo de una FK. Sin esto, borrar una institución
-- hace seq scan y los JOIN de RLS pagan lo mismo. Misma nota que la plantilla
-- de la 100.
CREATE INDEX idx_erp_purchase_items_institution
  ON erp.purchase_items(institution_id);

ALTER TABLE erp.sale_items ADD COLUMN institution_id UUID;

UPDATE erp.sale_items i
   SET institution_id = s.institution_id
  FROM erp.sales s
 WHERE s.id = i.sale_id;

ALTER TABLE erp.sale_items ALTER COLUMN institution_id SET NOT NULL;

ALTER TABLE erp.sale_items
  ADD CONSTRAINT sale_items_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.vet_institutions(id) ON DELETE CASCADE;

CREATE INDEX idx_erp_sale_items_institution
  ON erp.sale_items(institution_id);

-- ----------------------------------------------------------------------------
-- 3 · Sacar las catorce FK de una sola columna
--
-- Doce de los catorce nombres los puso Postgres (`<tabla>_<columna>_fkey`).
-- Escribir esos literales apuesta a que el nombre sea idéntico en todos los
-- entornos, y la 051 ya dejó escrito por qué `DROP CONSTRAINT IF EXISTS` es
-- peor todavía: ante un nombre distinto no falla, no dropea nada, y la
-- restricción vieja se queda vigilando mientras la nueva se agrega al lado.
--
-- Este bloque busca cada FK por su FORMA —una sola columna, y que esa columna
-- sea la que esperamos— y aborta si no encuentra exactamente una. Cero significa
-- que la migración que la creó no corrió como está commiteada; más de una, que
-- hay una segunda regla desconocida sobre esa columna. Ninguno de los dos es un
-- estado donde una migración deba adivinar.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_objetivo RECORD;
  v_attnum   SMALLINT;
  v_nombre   TEXT;
  v_cuantos  INTEGER;
BEGIN
  FOR v_objetivo IN
    SELECT * FROM (VALUES
      ('stock_movements',   'product_id'),
      ('stock_movements',   'voids_movement_id'),
      ('purchases',         'supplier_id'),
      ('purchase_items',    'purchase_id'),
      ('purchase_items',    'product_id'),
      ('cash_movements',    'cash_account_id'),
      ('cash_movements',    'voids_movement_id'),
      ('cash_movements',    'sale_id'),
      ('account_movements', 'customer_id'),
      ('account_movements', 'voids_movement_id'),
      ('account_movements', 'sale_id'),
      ('sales',             'customer_id'),
      ('sale_items',        'sale_id'),
      ('sale_items',        'product_id')
    ) AS t(tabla, columna)
  LOOP
    SELECT a.attnum INTO v_attnum
      FROM pg_attribute a
     WHERE a.attrelid = format('erp.%I', v_objetivo.tabla)::regclass
       AND a.attname  = v_objetivo.columna
       AND NOT a.attisdropped;

    IF v_attnum IS NULL THEN
      RAISE EXCEPTION
        'Migración 112: erp.% no tiene la columna %. El esquema no es el que '
        'esta migración espera; revisá antes de seguir.',
        v_objetivo.tabla, v_objetivo.columna;
    END IF;

    SELECT count(*), min(conname)
      INTO v_cuantos, v_nombre
      FROM pg_constraint
     WHERE conrelid = format('erp.%I', v_objetivo.tabla)::regclass
       AND contype  = 'f'
       AND conkey   = ARRAY[v_attnum]::SMALLINT[];

    IF v_cuantos <> 1 THEN
      RAISE EXCEPTION
        'Migración 112: se esperaba exactamente UNA foreign key de una sola '
        'columna sobre erp.%(%) y hay %. Esta migración no adivina cuál '
        'reemplazar.',
        v_objetivo.tabla, v_objetivo.columna, v_cuantos;
    END IF;

    EXECUTE format(
      'ALTER TABLE erp.%I DROP CONSTRAINT %I',
      v_objetivo.tabla, v_nombre
    );

    RAISE NOTICE 'Migración 112: eliminada % sobre erp.%(%).',
      v_nombre, v_objetivo.tabla, v_objetivo.columna;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4 · Las catorce, ahora compuestas
--
-- Cada una conserva su `ON DELETE` original: no es cosmética, es el
-- comportamiento del que cada tabla ya depende.
--
-- OJO CON LOS TRES `SET NULL`. Un `ON DELETE SET NULL` pelado sobre una clave
-- compuesta anula TODAS sus columnas, `institution_id` incluida — que es
-- NOT NULL, así que la cascada abortaría. Es la misma contradicción que la 051
-- acaba de arreglar en `public`: "la referencia se anula" contra "la referencia
-- es obligatoria". La forma con columna, `SET NULL (voids_movement_id)`, existe
-- desde Postgres 15 y este proyecto corre 17.6.
--
-- Y NO ESCRIBAS `MATCH FULL`. Cinco de estas claves cuelgan de una columna
-- nullable (`voids_movement_id` ×3, `sale_id` ×2). Con `MATCH SIMPLE` —el
-- default— la restricción se satisface sola cuando alguna columna es NULL, que
-- es justo lo que queremos: un asiento sin venta asociada pasa, y uno que sí
-- nombra una venta se valida entero. `MATCH FULL` exigiría que `sale_id` e
-- `institution_id` fueran NULL a la vez, cosa que ninguna fila puede cumplir
-- porque `institution_id` es NOT NULL, y rompería cada asiento sin venta.
-- ----------------------------------------------------------------------------
ALTER TABLE erp.stock_movements
  ADD CONSTRAINT stock_movements_product_same_institution_fkey
  FOREIGN KEY (product_id, institution_id)
  REFERENCES erp.products(id, institution_id) ON DELETE CASCADE;

ALTER TABLE erp.stock_movements
  ADD CONSTRAINT stock_movements_voids_same_institution_fkey
  FOREIGN KEY (voids_movement_id, institution_id)
  REFERENCES erp.stock_movements(id, institution_id)
  ON DELETE SET NULL (voids_movement_id);

ALTER TABLE erp.purchases
  ADD CONSTRAINT purchases_supplier_same_institution_fkey
  FOREIGN KEY (supplier_id, institution_id)
  REFERENCES erp.suppliers(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE erp.purchase_items
  ADD CONSTRAINT purchase_items_purchase_same_institution_fkey
  FOREIGN KEY (purchase_id, institution_id)
  REFERENCES erp.purchases(id, institution_id) ON DELETE CASCADE;

ALTER TABLE erp.purchase_items
  ADD CONSTRAINT purchase_items_product_same_institution_fkey
  FOREIGN KEY (product_id, institution_id)
  REFERENCES erp.products(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE erp.cash_movements
  ADD CONSTRAINT cash_movements_account_same_institution_fkey
  FOREIGN KEY (cash_account_id, institution_id)
  REFERENCES erp.cash_accounts(id, institution_id) ON DELETE CASCADE;

ALTER TABLE erp.cash_movements
  ADD CONSTRAINT cash_movements_voids_same_institution_fkey
  FOREIGN KEY (voids_movement_id, institution_id)
  REFERENCES erp.cash_movements(id, institution_id)
  ON DELETE SET NULL (voids_movement_id);

ALTER TABLE erp.cash_movements
  ADD CONSTRAINT cash_movements_sale_same_institution_fkey
  FOREIGN KEY (sale_id, institution_id)
  REFERENCES erp.sales(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE erp.account_movements
  ADD CONSTRAINT account_movements_customer_same_institution_fkey
  FOREIGN KEY (customer_id, institution_id)
  REFERENCES erp.customers(id, institution_id) ON DELETE CASCADE;

ALTER TABLE erp.account_movements
  ADD CONSTRAINT account_movements_voids_same_institution_fkey
  FOREIGN KEY (voids_movement_id, institution_id)
  REFERENCES erp.account_movements(id, institution_id)
  ON DELETE SET NULL (voids_movement_id);

ALTER TABLE erp.account_movements
  ADD CONSTRAINT account_movements_sale_same_institution_fkey
  FOREIGN KEY (sale_id, institution_id)
  REFERENCES erp.sales(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE erp.sales
  ADD CONSTRAINT sales_customer_same_institution_fkey
  FOREIGN KEY (customer_id, institution_id)
  REFERENCES erp.customers(id, institution_id) ON DELETE RESTRICT;

ALTER TABLE erp.sale_items
  ADD CONSTRAINT sale_items_sale_same_institution_fkey
  FOREIGN KEY (sale_id, institution_id)
  REFERENCES erp.sales(id, institution_id) ON DELETE CASCADE;

ALTER TABLE erp.sale_items
  ADD CONSTRAINT sale_items_product_same_institution_fkey
  FOREIGN KEY (product_id, institution_id)
  REFERENCES erp.products(id, institution_id) ON DELETE RESTRICT;

-- `sales.payment_method → erp.payment_methods` queda de una sola columna a
-- propósito: es un catálogo global, sin `institution_id`. Es la única excepción
-- declarada, y el test de invariantes la excluye por estructura —mira que las
-- dos tablas tengan la columna— y no por una lista que alguien deba mantener.

-- ----------------------------------------------------------------------------
-- 5 · Las tres funciones que leen o escriben sin mirar la institución
--
-- La FK compuesta ya impide que estas funciones reciban una fila cruzada. El
-- filtro se agrega igual: una función `SECURITY DEFINER` que confía en que otra
-- restricción la proteja es la que se rompe el día que esa restricción cambia.
-- Y en el caso del lookup, la FK ni siquiera llega a correr — el trigger BEFORE
-- lee primero.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION erp.apply_movement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE erp.products
     SET stock = stock + NEW.quantity
   WHERE id = NEW.product_id
     AND institution_id = NEW.institution_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

-- El lookup acotado es lo que apaga el oráculo: un `product_id` ajeno deja de
-- encontrar fila y cae en el `El producto no existe` genérico que ya existía.
-- Mismo mensaje que un id inventado, así que el rechazo tampoco delata si el
-- producto existe en otra veterinaria.
CREATE OR REPLACE FUNCTION erp.check_stock_suficiente()
RETURNS TRIGGER AS $$
DECLARE
  v_stock NUMERIC(12,3);
  v_nombre TEXT;
BEGIN
  IF NEW.voids_movement_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity > 0 THEN
    RETURN NEW;
  END IF;

  SELECT stock, name INTO v_stock, v_nombre
    FROM erp.products
   WHERE id = NEW.product_id
     AND institution_id = NEW.institution_id
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

-- Mismo tratamiento en caja. `ERP02` filtraba el saldo del cajón ajeno igual que
-- `ERP01` filtraba el stock: 'La caja quedaría en negativo: hay %'. Con el
-- lookup acotado, una caja ajena cae en el 'La caja no existe' genérico.
CREATE OR REPLACE FUNCTION erp.apply_cash_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  IF NEW.voids_movement_id IS NOT NULL THEN
    UPDATE erp.cash_accounts
       SET balance_cents = balance_cents + NEW.amount_cents
     WHERE id = NEW.cash_account_id
       AND institution_id = NEW.institution_id;

    RETURN NEW;
  END IF;

  IF NEW.amount_cents > 0 THEN
    UPDATE erp.cash_accounts
       SET balance_cents = balance_cents + NEW.amount_cents
     WHERE id = NEW.cash_account_id
       AND institution_id = NEW.institution_id;

    RETURN NEW;
  END IF;

  SELECT balance_cents INTO v_balance
    FROM erp.cash_accounts
   WHERE id = NEW.cash_account_id
     AND institution_id = NEW.institution_id
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
   WHERE id = NEW.cash_account_id
     AND institution_id = NEW.institution_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

-- ----------------------------------------------------------------------------
-- 6 · De dónde sacan la institución las dos tablas de ítems
--
-- `institution_id` acaba de nacer NOT NULL en `purchase_items` y `sale_items`, y
-- quien las llena hoy no la pasa: `erp.register_purchase()` (105:186) y
-- `erp.register_sale()` (108:400) listan sus columnas a mano y esa no está. Sin
-- resolverlo, las dos RPC quedan rotas — 19 pruebas de RLS lo confirmaron antes
-- de que esto se escribiera.
--
-- POR QUÉ UN TRIGGER Y NO REESCRIBIR LAS DOS RPC.
--
-- Reemplazarlas significaba copiar unas 275 líneas de `register_purchase` y
-- `register_sale` dentro de esta migración para cambiar una línea en cada una.
-- Eso es una bomba de tiempo: el día que alguien mejore esas funciones en una
-- migración posterior, esta copia vieja no se entera, y si por cualquier razón
-- se reaplica el orden, le pisa los cambios con código del pasado. Una migración
-- de seguridad no tiene por qué cargar con el cuerpo de la lógica de negocio de
-- otro módulo.
--
-- El trigger deriva lo que la tabla ya sabía derivar por JOIN, y cubre a
-- cualquiera que inserte — las dos RPC de hoy y lo que venga mañana.
--
-- NO DEBILITA EL AISLAMIENTO, y conviene entender por qué. El trigger solo
-- rellena cuando la columna viene NULL; si alguien la manda explícita y no
-- coincide con el padre, la FK compuesta de arriba lo rechaza igual. Y el agujero
-- que de verdad cierra esta migración en estas dos tablas es `product_id`, que
-- sigue atado contra `products(id, institution_id)`: una línea de venta mía con
-- el producto de otra veterinaria ya no entra.
--
-- SIN `SECURITY DEFINER`, A PROPÓSITO — y esto es lo contrario de lo que pide el
-- reflejo. Corriendo con los privilegios de quien inserta, el trigger solo puede
-- leer las compras y ventas que RLS le muestra. Si alguien intenta colgar un ítem
-- de una compra ajena, el SELECT no encuentra fila, `institution_id` queda NULL y
-- el NOT NULL lo frena. Con `SECURITY DEFINER` vería todas las filas y derivaría
-- alegremente la institución de la víctima. Las RPC que sí son DEFINER
-- (`register_purchase`, `register_sale`) siguen funcionando porque adentro de
-- ellas RLS no corre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.derive_purchase_item_institution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.institution_id IS NULL THEN
    SELECT p.institution_id INTO NEW.institution_id
      FROM erp.purchases p
     WHERE p.id = NEW.purchase_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, erp;

COMMENT ON FUNCTION erp.derive_purchase_item_institution() IS
  'Completa purchase_items.institution_id desde su compra cuando el INSERT no lo '
  'trae. Sin SECURITY DEFINER a propósito: así solo deriva de compras que RLS le '
  'deja ver a quien inserta.';

CREATE TRIGGER purchase_items_derive_institution
  BEFORE INSERT ON erp.purchase_items
  FOR EACH ROW EXECUTE FUNCTION erp.derive_purchase_item_institution();

CREATE OR REPLACE FUNCTION erp.derive_sale_item_institution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.institution_id IS NULL THEN
    SELECT s.institution_id INTO NEW.institution_id
      FROM erp.sales s
     WHERE s.id = NEW.sale_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, erp;

COMMENT ON FUNCTION erp.derive_sale_item_institution() IS
  'Completa sale_items.institution_id desde su venta cuando el INSERT no lo trae. '
  'Sin SECURITY DEFINER a propósito: así solo deriva de ventas que RLS le deja '
  'ver a quien inserta.';

CREATE TRIGGER sale_items_derive_institution
  BEFORE INSERT ON erp.sale_items
  FOR EACH ROW EXECUTE FUNCTION erp.derive_sale_item_institution();

-- ----------------------------------------------------------------------------
-- 7 · El invariante, consultable
--
-- Arreglar las catorce claves no impide que la número quince nazca mal. Esta
-- función devuelve toda FK del schema `erp` que apunte a otra tabla del schema
-- y NO sea compuesta, siempre que las dos tengan `institution_id`. Tiene que
-- devolver cero filas; si devuelve alguna, alguien reintrodujo el patrón que
-- esta migración vino a cerrar.
--
-- El filtro se apoya en que AMBAS tablas tengan la columna, no en una lista de
-- excepciones. Así el catálogo global (`sales.payment_method`) y las FK hacia
-- `public` quedan afuera por estructura, y nadie tiene que acordarse de
-- mantener una lista cuando agregue una tabla.
--
-- Sin `SECURITY DEFINER`: `pg_constraint` es legible por cualquiera, no hace
-- falta elevar nada. Y se le revoca a `anon` y `authenticated` porque enumerar
-- la forma del esquema no es asunto de un usuario de la aplicación — la usan el
-- test de invariantes y quien opere la base.
-- ----------------------------------------------------------------------------
-- Devuelve TODAS las FK internas con dueño, no solo las que violan la regla, y
-- eso es deliberado: una función que solo devuelve infractoras pasa el test en
-- verde tanto cuando el esquema está sano como cuando la consulta se rompió y no
-- ve nada. Con la lista completa, el test puede exigir que haya filas —la
-- inspección funciona— y que ninguna sea simple.
CREATE OR REPLACE FUNCTION erp.fks_internas()
RETURNS TABLE (nombre TEXT, tabla TEXT, columnas TEXT, es_compuesta BOOLEAN)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, erp AS $$
  SELECT c.conname::TEXT,
         c.conrelid::regclass::TEXT,
         (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
            FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a
              ON a.attrelid = c.conrelid AND a.attnum = k.attnum),
         array_length(c.conkey, 1) >= 2
    FROM pg_constraint c
   WHERE c.connamespace = 'erp'::regnamespace
     AND c.contype = 'f'
     -- Por OID y no por el texto de `regclass`: con `erp` en el search_path,
     -- `confrelid::regclass::TEXT` devuelve `products` y no `erp.products`, así
     -- que un LIKE 'erp.%' no matchea nunca y la función devuelve vacío. Lo
     -- cazó el test de "la inspección encuentra las claves", que existe
     -- justamente para que un vacío no se lea como un esquema sano.
     AND c.confrelid IN (
           SELECT oid FROM pg_class WHERE relnamespace = 'erp'::regnamespace
         )
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.conrelid
                    AND a.attname = 'institution_id' AND NOT a.attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.confrelid
                    AND a.attname = 'institution_id' AND NOT a.attisdropped);
$$;

COMMENT ON FUNCTION erp.fks_internas() IS
  'Toda FK entre dos tablas del schema erp que llevan institution_id, con el dato '
  'de si es compuesta. Ninguna puede tener es_compuesta = false: cada una de esas '
  'es una puerta abierta entre veterinarias. La ejercita '
  'tests/rls/erp-schema-invariantes.test.ts.';

REVOKE EXECUTE ON FUNCTION erp.fks_internas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.fks_internas() TO service_role;

-- ROLLBACK
-- Las migraciones son append-only: volver atrás es una 113, nunca una edición de
-- este archivo. Antes de escribirla, esta consulta decide si hace falta algo más
-- que dropear restricciones:
--
--   SELECT count(*) FROM erp.purchase_items WHERE institution_id IS NOT NULL;
--
-- 1 · DROPEAR LAS CATORCE COMPUESTAS y recrear las simples. Los nombres nuevos
--     son explícitos, así que acá sí se pueden escribir literales:
--
--     ALTER TABLE erp.stock_movements
--       DROP CONSTRAINT stock_movements_product_same_institution_fkey,
--       DROP CONSTRAINT stock_movements_voids_same_institution_fkey;
--     ALTER TABLE erp.stock_movements
--       ADD FOREIGN KEY (product_id) REFERENCES erp.products(id) ON DELETE CASCADE,
--       ADD FOREIGN KEY (voids_movement_id) REFERENCES erp.stock_movements(id) ON DELETE SET NULL;
--     -- (ídem para purchases, purchase_items, cash_movements, account_movements,
--     --  sales y sale_items, con el ON DELETE de la tabla del diseño)
--
-- 2 · LAS DOS COLUMNAS DENORMALIZADAS. Dropearlas pierde el dato, pero es
--     reconstruible desde el padre, que es de donde salió:
--
--     ALTER TABLE erp.purchase_items DROP COLUMN institution_id;
--     ALTER TABLE erp.sale_items     DROP COLUMN institution_id;
--
-- 3 · LOS TRES CUERPOS ANTERIORES. Son los de arriba SIN la línea
--     `AND institution_id = NEW.institution_id` en cada UPDATE y en cada
--     SELECT ... FOR UPDATE. En `erp.apply_cash_movement()` son cuatro lugares:
--     los tres UPDATE y el SELECT. En `erp.check_stock_suficiente()`, uno.
--     En `erp.apply_movement()`, uno.
--
-- 4 · LOS DOS TRIGGERS DE DERIVACIÓN. Van antes de dropear las columnas, o el
--     DROP COLUMN falla por dependencia:
--
--     DROP TRIGGER IF EXISTS purchase_items_derive_institution ON erp.purchase_items;
--     DROP TRIGGER IF EXISTS sale_items_derive_institution     ON erp.sale_items;
--     DROP FUNCTION IF EXISTS erp.derive_purchase_item_institution();
--     DROP FUNCTION IF EXISTS erp.derive_sale_item_institution();
--
-- 5 · Las nueve `UNIQUE (id, institution_id)` pueden quedarse: sin una FK que
--     las use son inertes, y borrarlas solo agrega riesgo al rollback.
--
-- ADVERTENCIA: este rollback reabre el vector. Solo tiene sentido si el schema
-- `erp` entero se retira con él.
