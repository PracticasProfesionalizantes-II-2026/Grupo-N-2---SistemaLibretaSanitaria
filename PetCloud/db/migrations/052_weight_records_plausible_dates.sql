-- ============================================================================
-- PetCloud — Migración 052: un pesaje no puede haber ocurrido antes de que la
-- mascota naciera, ni todavía no haber ocurrido
--
-- `weight_records.recorded_at` (002:267) nació con `DEFAULT CURRENT_DATE` y sin
-- una sola restricción detrás. El default cubre el camino feliz —el formulario
-- manda hoy— y por eso la ausencia de reglas no se notó: ninguna pantalla
-- ofrecía escribir una fecha imposible, así que ninguna se escribió. Pero el
-- `<input type="date">` del modal de peso no tiene `min` ni `max`, la action no
-- mira la fecha antes de insertar, y `recorded_at` es un campo que el cliente
-- manda entero. Alcanza con teclear mal el año.
--
-- Lo que se rompe cuando entra una fecha imposible no es la fila: es el
-- gráfico. La curva de peso se lee en el eje del tiempo, y un pesaje fechado en
-- 2027 o tres años antes del nacimiento la estira hasta dejar ilegible el resto
-- de la serie. Peor todavía: `sincronizarPesoDeFicha` toma el último registro
-- por fecha para actualizar `pets.weight`, así que una fecha futura secuestra
-- el peso actual de la ficha y lo deja clavado hasta que alguien encuentre la
-- fila culpable.
--
-- Son dos reglas, y van en dos mecanismos distintos a propósito.
--
-- ----------------------------------------------------------------------------
-- Por qué "no futura" es un CHECK y "no anterior al nacimiento" no puede serlo
-- ----------------------------------------------------------------------------
--
-- Un CHECK de tabla solo puede mirar las columnas de la fila que se está
-- escribiendo. No puede hacer un SELECT contra otra tabla: Postgres lo rechaza
-- al crearlo, y con razón —una restricción que dependiera de otra tabla
-- dejaría de valer sola con que esa otra tabla cambie, sin que nadie toque la
-- fila restringida—. La fecha de nacimiento vive en `pets.date_of_birth`, otra
-- tabla. Así que esa mitad de la regla no tiene forma de ser un CHECK, y baja
-- a un trigger `BEFORE INSERT OR UPDATE`, que sí puede consultar.
--
-- La mitad que sí entra en un CHECK es `recorded_at <= CURRENT_DATE`, y ahí hay
-- una trampa clásica que conviene desarmar antes de que alguien la levante en
-- la revisión: los CHECK con funciones no inmutables son peligrosos porque
-- Postgres los valida **una sola vez**, al escribir la fila, y después asume
-- para siempre que se cumplen. Un `pg_dump`/`restore` los revalida todos, y ahí
-- aparece el desastre: filas que pasaron en su momento y ya no pasan, con el
-- restore abortando.
--
-- Esa trampa corre en una sola dirección, y es la contraria a esta. Es fatal
-- cuando la condición se vuelve *más* difícil de cumplir con el paso del
-- tiempo (`recorded_at >= CURRENT_DATE`, por ejemplo: lo que hoy es futuro
-- mañana es pasado y el restore explota). Acá la condición es
-- `recorded_at <= CURRENT_DATE`: una fila que la cumple hoy la cumple mañana,
-- y la cumplirá en diez años, porque `CURRENT_DATE` solo crece y la fecha
-- guardada no se mueve. El conjunto de filas válidas es monótono creciente. Un
-- restore nunca puede encontrarla rota.
--
-- Lo único que este CHECK no puede hacer es lo que tampoco le pedimos: impedir
-- que una fila escrita ayer sea "revalidada" hoy. No hace falta — sigue siendo
-- verdadera.
--
-- ----------------------------------------------------------------------------
-- Por qué la reparación de datos va ANTES del ALTER TABLE
-- ----------------------------------------------------------------------------
--
-- `ADD CONSTRAINT ... CHECK` no es una declaración a futuro: Postgres recorre
-- la tabla entera y valida cada fila existente antes de aceptarlo. Si en
-- producción hay una sola fila con fecha futura, el ALTER falla con 23514 y el
-- deploy se frena — sobre una migración que ya está commiteada y es append-only,
-- así que la salida sería escribir una 053 a las apuradas.
--
-- La reparación no borra nada. El peso medido es un dato real: alguien puso al
-- animal en la balanza y leyó un número. Lo que estaba mal era la fecha, y para
-- reemplazarla hay un dato verdadero a mano que no hay que inventar:
-- `created_at`, el instante en que la fila se escribió. No es cuándo se pesó al
-- animal, pero es la mejor cota disponible y no es una invención.
--
-- Dos ajustes sobre esa base:
--
--   · Si `created_at::date` todavía cae antes del nacimiento (una mascota
--     cargada con fecha de nacimiento posterior a un pesaje ya existente), se
--     usa `date_of_birth`: el primer día en que ese pesaje pudo ocurrir.
--   · El resultado se recorta a `CURRENT_DATE`. Solo hace falta para el caso
--     patológico de una mascota con `date_of_birth` en el futuro —que esta
--     migración no restringe— y evita que la reparación fabrique justo la fila
--     que el CHECK de abajo va a rechazar.
--
-- Rollback:
--   DROP TRIGGER weight_records_fecha_plausible ON weight_records;
--   DROP FUNCTION validar_fecha_registro_peso();
--   ALTER TABLE weight_records DROP CONSTRAINT weight_records_no_futura;
--   (las fechas reparadas no se pueden deshacer: las originales eran inválidas)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Reparación de las filas históricas, antes de que el CHECK las mire
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_reparadas INTEGER;
BEGIN
  WITH reparadas AS (
    UPDATE weight_records w
       SET recorded_at = LEAST(
             GREATEST(
               w.created_at::date,
               COALESCE(p.date_of_birth, w.created_at::date)
             ),
             CURRENT_DATE
           )
      FROM pets p
     WHERE p.id = w.pet_id
       AND (
             w.recorded_at > CURRENT_DATE
             OR (p.date_of_birth IS NOT NULL AND w.recorded_at < p.date_of_birth)
           )
    RETURNING 1
  )
  SELECT count(*) INTO v_reparadas FROM reparadas;

  RAISE NOTICE
    'Migración 052: se repararon % fechas de pesaje imposibles (se reemplazaron por la fecha de carga del registro).',
    v_reparadas;
END $$;

-- ----------------------------------------------------------------------------
-- 2 · La mitad de la regla que sí cabe en un CHECK
-- ----------------------------------------------------------------------------
ALTER TABLE weight_records
  ADD CONSTRAINT weight_records_no_futura
  CHECK (recorded_at <= CURRENT_DATE);

COMMENT ON CONSTRAINT weight_records_no_futura ON weight_records IS
  'Un pesaje no puede estar fechado en el futuro. La condición es monótona '
  '(lo que se cumple hoy se cumple siempre), así que un restore no la rompe.';

-- ----------------------------------------------------------------------------
-- 3 · La mitad que necesita mirar `pets`, en trigger
-- ----------------------------------------------------------------------------
--
-- `SECURITY INVOKER` explícito, igual que la 050: la función corre con los
-- permisos y las políticas de quien escribe, no con las del dueño de la
-- función. Eso importa porque el cuerpo consulta `pets`, que tiene RLS. Si
-- quien inserta el pesaje no puede ver la mascota, el SELECT no devuelve fila y
-- la validación se saltea — lo cual es correcto acá: esta función no es una
-- barrera de acceso (de eso se ocupan las políticas de `weight_records`), es
-- una verificación de plausibilidad. Quien no puede leer la mascota tampoco
-- puede escribirle pesajes.
--
-- `SET search_path = public` fija la resolución de nombres: sin eso, el
-- `search_path` de la sesión decide qué tabla es `pets`.
CREATE OR REPLACE FUNCTION validar_fecha_registro_peso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_nacimiento DATE;
BEGIN
  SELECT date_of_birth INTO v_nacimiento
    FROM pets
   WHERE id = NEW.pet_id;

  -- Sin fecha de nacimiento cargada no hay piso contra el cual comparar.
  -- `date_of_birth` es NULLABLE (002:45) y lo seguirá siendo: hay mascotas
  -- adoptadas de las que nadie sabe cuándo nacieron. Rechazar sus pesajes
  -- sería castigar un dato ausente, no uno erróneo.
  IF v_nacimiento IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.recorded_at < v_nacimiento THEN
    RAISE EXCEPTION
      'La fecha del pesaje (%) es anterior al nacimiento de la mascota (%). Revisá la fecha o corregí la fecha de nacimiento en la ficha.',
      NEW.recorded_at, v_nacimiento
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validar_fecha_registro_peso() IS
  'Rechaza los pesajes fechados antes del nacimiento de la mascota. No valida '
  'nada si la mascota no tiene fecha de nacimiento cargada. SQLSTATE 23514.';

-- BEFORE y no AFTER: si el pesaje no puede existir, no tiene que llegar a
-- escribirse. Va en INSERT y en UPDATE porque `updateWeightRecord` mueve
-- `recorded_at`, que es exactamente la operación que puede llevar una fila
-- válida a una fecha imposible.
CREATE TRIGGER weight_records_fecha_plausible
  BEFORE INSERT OR UPDATE ON weight_records
  FOR EACH ROW EXECUTE FUNCTION validar_fecha_registro_peso();
