-- ============================================================================
-- PetCloud ERP — Migración 114: el motivo del movimiento manual
--
-- EL PROBLEMA QUE RESUELVE. `erp.stock_movements.kind` (101:114-121) dice
-- "salida por pérdida", pero no distingue una rotura de un vencimiento, ni un
-- insumo consumido en la atención de una muestra regalada a un cliente. El
-- motivo real del movimiento terminaba como prosa libre en `note`, y sobre
-- prosa no se reporta: "cuánto perdimos por vencimiento el mes pasado" no
-- tiene respuesta cuando la respuesta está escrita en castellano distinto en
-- cada carga. Justo esas tres cifras —mermas, vencimientos, consumo interno—
-- son las que un dueño de veterinaria mira.
--
-- LO QUE AGREGA. Una columna `reason` de vocabulario cerrado, que es lo que
-- la pantalla manual pasa a preguntar EN LUGAR del tipo técnico. El `kind` no
-- se deriva en la base ni desaparece: se sigue escribiendo, y el CHECK de
-- coherencia de abajo garantiza que los dos nunca se contradigan.
--
-- LO QUE NO CAMBIA, dicho en voz alta porque romperlo tira abajo dos módulos:
-- el CHECK de `kind` SIGUE aceptando 'purchase' y 'sale'. Compras (105:194-204)
-- y Ventas (108:411, 109:134-146) escriben esos kinds y van a seguir
-- haciéndolo. Lo que se saca es la OPCIÓN EN LA PANTALLA MANUAL —donde una
-- compra cargada a mano quedaba indistinguible de una compra real del módulo
-- de Compras—, nunca el vocabulario de la base.
--
-- Tampoco se toca el contenido de `note`: la anulación de ventas encuentra el
-- movimiento original comparando `note = 'Venta ' || sale_id` (109:112). Es
-- una convención frágil por texto y sigue en pie tal cual.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · erp.stock_movements.reason — el por qué, en vocabulario cerrado
--
-- NULLABLE a propósito, y no es un permiso: es la única forma de que la
-- migración corra sobre las filas que ya existen y de que Compras y Ventas
-- sigan escribiendo sin motivo. `NULL` significa "este movimiento no lo cargó
-- una persona eligiendo un motivo": lo emitió un documento (una compra, una
-- venta) que ya explica por qué existe, y su `kind` alcanza para leerlo.
--
-- Vocabulario en castellano, igual que `erp.cash_movements.kind` (106) y a
-- diferencia de `stock_movements.kind`: `reason` nace de la pantalla y la
-- pantalla habla en castellano. Que un valor nuevo sea ampliar un CHECK y no
-- migrar un ENUM es el mismo criterio de la 101 (101:49-53).
-- ----------------------------------------------------------------------------
ALTER TABLE erp.stock_movements
  ADD COLUMN reason TEXT;

-- ----------------------------------------------------------------------------
-- 2 · El CHECK de coherencia: un motivo implica su kind, siempre
--
-- Es UN SOLO constraint y no dos —uno de vocabulario y otro de coherencia—
-- porque la lista de pares ya ES el vocabulario: un motivo que no está en
-- ningún par no existe. Dos constraints serían dos listas que se pueden
-- desincronizar.
--
-- Sin esto, nada impediría guardar una merma con `kind = 'purchase'`: el
-- reporte de mermas la contaría como pérdida y el de compras como entrada, la
-- misma fila sumando en dos lados opuestos. Y es exactamente el error que
-- puede cometer un INSERT hecho a mano desde soporte, que es el escritor que
-- ninguna validación de aplicación alcanza.
--
-- NO ROMPE A NINGÚN ESCRITOR EXISTENTE porque todos dejan `reason` en NULL:
-- `erp.register_purchase()` (105:194-204), `erp.register_sale()` (108:411),
-- `erp.void_sale()` (109:134-146) y `erp.void_movement()` (101:231-243)
-- enumeran sus columnas y ninguna es esta. El punto 3 de abajo es el único
-- que se modifica, y lo hace para COPIAR el motivo del original, nunca para
-- inventar uno.
-- ----------------------------------------------------------------------------
ALTER TABLE erp.stock_movements
  ADD CONSTRAINT stock_movements_reason_kind_coherentes
  CHECK (
    reason IS NULL OR (kind, reason) IN (
      ('adjustment', 'ajuste_inventario'),
      ('loss',       'merma'),
      ('loss',       'vencimiento'),
      ('use',        'consumo_interno'),
      ('use',        'muestra_gratis'),
      ('return',     'devolucion_cliente')
    )
  );

COMMENT ON COLUMN erp.stock_movements.reason IS
  'Por qué se movió el stock, elegido de una lista cerrada en la pantalla '
  'manual. NULL cuando el movimiento lo emitió un documento (compra, venta) '
  'que ya explica su propia existencia: ahí el por qué se lee en kind. '
  'El CHECK stock_movements_reason_kind_coherentes obliga a que motivo y kind '
  'digan lo mismo; purchase y sale no tienen motivo posible, y es deliberado '
  '(tienen sus propios módulos).';

-- ----------------------------------------------------------------------------
-- 3 · erp.void_movement() copia el motivo al contrasiento
--
-- POR QUÉ NO ALCANZA CON DEJARLO EN NULL. La 101 apoya su reconciliación en
-- que un movimiento anulado y su contrasiento se cancelan al sumar
-- (101:308-309). Esa propiedad se pierde en cuanto se agrupa por motivo: una
-- merma de 5 anulada dejaría el original con `reason = 'merma'` y el
-- contrasiento con NULL, así que `SUM(quantity) GROUP BY reason` seguiría
-- informando 5 unidades perdidas por merma que nadie perdió. El reporte de
-- mermas es la razón entera de esta migración; nacería mintiendo.
--
-- El motivo se copia del original, no se recibe por parámetro: un contrasiento
-- no es un movimiento nuevo con su propia intención, es el espejo de otro. Y
-- como el `kind` también se copia, el par sigue siendo coherente por
-- construcción.
--
-- Cuerpo verbatim de la 101 (101:192-248) más esas dos líneas. El de la 101
-- queda pegado completo en el ROLLBACK de abajo para que una futura `115` no
-- tenga que ir a buscarlo a un commit viejo — mismo criterio que la 113.
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
    unit_cost_cents, note, reason, voids_movement_id, created_by
  ) VALUES (
    v_original.institution_id,
    v_original.product_id,
    v_original.kind,
    -v_original.quantity,
    v_original.unit_cost_cents,
    COALESCE(p_reason, 'Anulación'),
    v_original.reason,
    p_movement_id,
    v_professional_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;

-- ============================================================================
-- Permisos
--
-- No hay nada que otorgar: los GRANT de la 101 (101:272) son a nivel de tabla
-- y alcanzan a las columnas nuevas, y `erp.void_movement()` conserva su firma,
-- así que su GRANT a `authenticated` (101:292) sigue vigente. Se deja escrito
-- para que nadie lo tenga que verificar de nuevo.
-- ============================================================================

-- ============================================================================
-- ROLLBACK
--
-- Migraciones append-only: revertir es una `115` nueva, nunca una edición de
-- este archivo.
--
--   1. `ALTER TABLE erp.stock_movements
--         DROP CONSTRAINT stock_movements_reason_kind_coherentes;`
--   2. `ALTER TABLE erp.stock_movements DROP COLUMN reason;`
--      (el orden importa: el CHECK depende de la columna)
--   3. Restaurar el cuerpo de `erp.void_movement()` a la versión de la 101,
--      pegado acá abajo verbatim:
--
-- CREATE OR REPLACE FUNCTION erp.void_movement(
--   p_movement_id UUID,
--   p_reason TEXT DEFAULT NULL
-- )
-- RETURNS UUID AS $$
-- DECLARE
--   v_original erp.stock_movements;
--   v_professional_id UUID;
--   v_new_id UUID;
-- BEGIN
--   SELECT * INTO v_original
--     FROM erp.stock_movements
--    WHERE id = p_movement_id;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'El movimiento no existe' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF NOT erp.has_access(v_original.institution_id) THEN
--     RAISE EXCEPTION 'Sin acceso a ese movimiento' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_original.voided_at IS NOT NULL THEN
--     RAISE EXCEPTION 'Ese movimiento ya estaba anulado' USING ERRCODE = 'invalid_parameter_value';
--   END IF;
--
--   IF v_original.voids_movement_id IS NOT NULL THEN
--     RAISE EXCEPTION 'Un contrasiento no se anula' USING ERRCODE = 'invalid_parameter_value';
--   END IF;
--
--   v_professional_id := public.my_vet_professional_id();
--
--   UPDATE erp.stock_movements
--      SET voided_at = now(),
--          voided_by = v_professional_id
--    WHERE id = p_movement_id;
--
--   INSERT INTO erp.stock_movements (
--     institution_id, product_id, kind, quantity,
--     unit_cost_cents, note, voids_movement_id, created_by
--   ) VALUES (
--     v_original.institution_id,
--     v_original.product_id,
--     v_original.kind,
--     -v_original.quantity,
--     v_original.unit_cost_cents,
--     COALESCE(p_reason, 'Anulación'),
--     p_movement_id,
--     v_professional_id
--   )
--   RETURNING id INTO v_new_id;
--
--   RETURN v_new_id;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, erp;
-- ============================================================================
