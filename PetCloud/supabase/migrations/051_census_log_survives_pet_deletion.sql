-- ============================================================================
-- PetCloud — Migración 051: la auditoría del padrón sobrevive al borrado de la
-- mascota
--
-- La 023 dejó dos reglas sobre la misma columna que no pueden ser verdad a la
-- vez:
--
--   · `pet_id UUID REFERENCES pets(id) ON DELETE SET NULL` (023:57) — si la
--     mascota se borra, la referencia se anula y la fila de auditoría queda.
--   · un CHECK de tabla, anónimo (023:64-67), que exige `pet_id IS NOT NULL`
--     cuando la acción es 'record_view'.
--
-- Mientras nadie borre una mascota consultada, las dos conviven. Después no: la
-- cascada `auth.users` → `profiles` → `pets` → `SET NULL` ejecuta un UPDATE
-- sobre esta tabla, ese UPDATE viola el CHECK (SQLSTATE 23514) y **el DELETE
-- entero se aborta**. Lo que se rompe no es una fila de auditoría: es el
-- derecho al borrado de la cuenta, en producción, contra el flujo que la 036
-- construyó a propósito.
--
-- Cuál de las dos reglas cede ya estaba contestado en el encabezado de la
-- propia 023 (023:30-33): los snapshots existen para que la fila siga siendo
-- legible cuando lo que referencia desaparece. `actor_profile_id` ya tenía esa
-- exención —se anula al borrarse la cuenta del funcionario y ningún CHECK lo
-- impide—; `pet_id` era el que había quedado al revés. Es la misma lección que
-- la 007 aprendió en su versión de FK: `SET NULL` sobre una columna `NOT NULL`
-- no se puede sostener, y lo que cede es la exigencia, no el borrado.
--
-- El dato obligatorio pasa a ser `pet_label`, que nombra a la mascota sin
-- depender de que exista. La auditoría no se debilita: se apoya en lo único que
-- sigue estando.
--
-- ----------------------------------------------------------------------------
-- Por qué un bloque DO y no un DROP CONSTRAINT a secas
-- ----------------------------------------------------------------------------
--
-- El CHECK de la 023 es anónimo: el nombre lo puso Postgres. Acá se llama
-- `municipality_census_access_log_check` —confirmado en el error real de la
-- base local—, pero eso es evidencia de UNA base. Escribir ese literal apuesta
-- a que el nombre sea idéntico en todos los entornos, y si no lo es, el deploy
-- se frena sobre un archivo que es append-only: la salida sería editar a mano
-- una migración ya commiteada, o escribir una 052.
--
-- `DROP CONSTRAINT IF EXISTS` es peor, y por eso no está acá. Si el nombre no
-- coincide, no falla: no dropea nada, el CHECK nuevo se agrega **al lado** del
-- viejo, y el viejo sigue abortando cada DELETE. Un fallo silencioso cuyo
-- síntoma es idéntico al bug, con una migración en el historial que dice que
-- está arreglado. (La 007:31 usa ese patrón sin riesgo porque vuelve a crear la
-- misma FK con el mismo nombre; acá las dos restricciones se contradicen, así
-- que convivir no es redundante: es fatal.)
--
-- El bloque de abajo resuelve el nombre por la definición, no por el nombre, y
-- **aborta si no encuentra exactamente uno**. Cero significa que la 023 no
-- corrió como está commiteada o que alguien ya tocó la tabla a mano; más de uno
-- significa que hay una segunda regla desconocida sobre `pet_id`. Ninguno de
-- los dos es un estado donde una migración deba adivinar.
--
-- Antes de aplicar (manual, del maintainer): esta consulta debe dar 0.
--
--   SELECT count(*) FROM municipality_census_access_log
--   WHERE action = 'record_view' AND pet_label IS NULL;
--
-- Si no da 0, no apliques: hay un escritor fuera de las funciones de la 023/038
-- —las únicas que escriben `record_view`, y siempre con `pet_label` derivado de
-- `pets.name`, que es NOT NULL (002:42)— y ese escritor es el problema real.
--
-- Qué NO hace esta migración: no toca la FK, ni la tabla, ni las políticas, ni
-- las tres funciones que escriben en el registro, ni el índice parcial
-- `idx_census_access_log_pet` (023:73-75) — las filas con `pet_id` NULL salen
-- del índice, que es lo correcto: ya no se llega a ellas por mascota.
-- ============================================================================

DO $$
DECLARE
  v_nombre TEXT;
  v_cuantos INTEGER;
BEGIN
  -- Se busca por la definición, no por el nombre: `pg_get_constraintdef`
  -- normaliza la expresión de la 023 e incluye literalmente `pet_id IS NOT
  -- NULL`. El otro CHECK de la tabla (el de `action IN (...)`, de columna) no
  -- menciona `pet_id`, así que no entra; y el CHECK nuevo de más abajo tampoco
  -- lo menciona, así que una reaplicación no se muerde la cola.
  SELECT count(*), min(conname)
    INTO v_cuantos, v_nombre
  FROM pg_constraint
  WHERE conrelid = 'public.municipality_census_access_log'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%pet_id IS NOT NULL%';

  IF v_cuantos = 0 THEN
    RAISE EXCEPTION
      'Migración 051: no se encontró en municipality_census_access_log ningún '
      'CHECK que exija "pet_id IS NOT NULL". Se esperaba el de la 023. Revisá '
      'el estado real de la tabla antes de seguir: aplicar a ciegas dejaría la '
      'regla vieja intacta.';
  ELSIF v_cuantos > 1 THEN
    RAISE EXCEPTION
      'Migración 051: hay % CHECK que exigen "pet_id IS NOT NULL" en '
      'municipality_census_access_log. Esta migración dropea uno solo y no '
      'adivina cuál.', v_cuantos;
  END IF;

  -- `min(conname)` se lee recién acá, con `v_cuantos = 1` ya probado: sobre una
  -- sola fila, el mínimo es esa fila.
  EXECUTE format(
    'ALTER TABLE public.municipality_census_access_log DROP CONSTRAINT %I',
    v_nombre
  );

  RAISE NOTICE 'Migración 051: se eliminó el CHECK "%" de la 023.', v_nombre;
END;
$$;

-- Con nombre explícito, a propósito: el nombre autogenerado del anterior es
-- exactamente lo que volvió difícil esta migración. Quien tenga que cambiar
-- esta regla dentro de dos años lo hace con dos palabras.
ALTER TABLE municipality_census_access_log
  ADD CONSTRAINT census_access_log_record_view_needs_snapshot CHECK (
    (action = 'record_view' AND pet_label IS NOT NULL)
    OR (action <> 'record_view' AND record_count IS NOT NULL)
  );

COMMENT ON CONSTRAINT census_access_log_record_view_needs_snapshot
  ON municipality_census_access_log IS
  'Una consulta de ficha tiene que decir QUÉ mascota se miró, y eso lo dice el '
  'snapshot pet_label, no la FK pet_id: la FK es ON DELETE SET NULL y se anula '
  'cuando se borra la cuenta del dueño. Exigir pet_id acá (023) hacía fallar '
  'ese borrado con SQLSTATE 23514. Las demás acciones siguen exigiendo '
  'record_count.';

-- ROLLBACK
-- Dos casos, y cuál corresponde depende de si ya se borró alguna mascota
-- auditada desde que esta migración se aplicó. La consulta que lo decide:
--
--   SELECT count(*) FROM municipality_census_access_log
--   WHERE action = 'record_view' AND pet_id IS NULL;
--
-- 1 · Da 0 — todavía no hay ninguna fila huérfana. Se puede volver exacto al
--     estado de la 023, restricción anónima incluida:
--
--     ALTER TABLE municipality_census_access_log
--       DROP CONSTRAINT census_access_log_record_view_needs_snapshot;
--     ALTER TABLE municipality_census_access_log
--       ADD CHECK (
--         (action = 'record_view' AND pet_id IS NOT NULL)
--         OR (action <> 'record_view' AND record_count IS NOT NULL)
--       );
--
-- 2 · Da más de 0 — ya hay filas con 'record_view' y `pet_id` NULL, escritas
--     legítimamente bajo esta migración. La expresión vieja ya no se puede
--     restaurar: el ADD fallaría al validarlas, y "arreglarlo" sería borrar
--     filas de auditoría para que entre una restricción. El único camino atrás
--     es dropear sin reemplazo, aceptando que hasta que se reaplique no hay
--     ninguna regla de payload:
--
--     ALTER TABLE municipality_census_access_log
--       DROP CONSTRAINT census_access_log_record_view_needs_snapshot;
--
-- En los dos casos el rollback es una migración nueva (052+), nunca una
-- edición de este archivo.
