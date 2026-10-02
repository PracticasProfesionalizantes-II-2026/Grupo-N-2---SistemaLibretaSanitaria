-- ============================================================================
-- PetCloud — Migración 057: el destino que le falta a las claves del ERP
--
-- Esta migración no arregla nada por sí sola, y es a propósito. Agrega una
-- restricción única sobre `(id, institution_id)` en `vet_professionals` para
-- que las FK del schema `erp` puedan apuntar al par en vez de solo al `id`.
-- Quien cierra el agujero es la **115**; esta abre la puerta para que exista.
--
-- POR QUÉ VA PARTIDA EN DOS ARCHIVOS
--
-- No es prolijidad ni convención de nombres: es **orden de ejecución**. Las
-- migraciones corren en orden lexicográfico, así que la serie `0xx` entera
-- corre ANTES que la `1xx`. En un `supabase db reset` limpio, esta migración se
-- aplica cuando el schema `erp` todavía no existe — la 100 lo crea cuarenta y
-- tres archivos más adelante. Una `057` que tocara `erp.sales` no sería un
-- problema de territorio: rompería el reset con "schema erp does not exist".
--
-- Por eso el trabajo se parte donde lo parte Postgres: acá el destino, en la
-- 115 las once claves que apuntan a él.
--
-- QUÉ ESTABA ROTO, EN UNA LÍNEA
--
-- Once FK del schema `erp` apuntan a `public.vet_professionals(id)` sin
-- comprobar que ese profesional trabaje en la institución del movimiento. Se
-- puede firmar un asiento contable —una venta, un movimiento de caja, una
-- anulación— a nombre de alguien de otra veterinaria. Es la misma familia de
-- defecto que arregló la 112 puertas adentro del ERP, y quedó afuera de aquel
-- barrido **por estructura**: `erp.fks_internas()` solo mira FK cuyo destino
-- también esté en `erp`, así que una que apunta a `public` le es invisible. El
-- test de invariantes está en verde y estas once están abiertas.
--
-- POR QUÉ UNA ÚNICA REDUNDANTE NO ES UNA REGLA NUEVA
--
-- `id` ya es PRIMARY KEY, así que si `id` es único el par `(id,
-- institution_id)` también lo es por construcción: esta restricción no puede
-- rechazar ninguna fila que hoy entre. No agrega una regla, agrega un
-- **destino**. Postgres exige que una FK compuesta apunte a una restricción
-- única sobre exactamente esas columnas, y sin esto la 115 no compila. Mismo
-- movimiento —y mismo razonamiento— que el bloque 1 de la 112.
--
-- El costo real es un índice único más sobre una tabla chica (una fila por
-- profesional por institución). No hay backfill, no hay reescritura de filas y
-- no hay ventana en la que la tabla quede bloqueada de forma apreciable.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, Y HAY QUE SABERLO
--
-- No toca las políticas de INSERT/UPDATE de `vet_professionals` (`001:246-254`),
-- que siguen sin restringir `institution_id`: cualquiera con una cuenta puede
-- adosarse a la veterinaria que quiera. Esa es la otra deuda anotada en
-- `docs/EN-CURSO.md`, es un ciclo propio, y necesita antes una decisión de
-- producto sobre quién puede afiliar a un profesional. Esta migración y la 115
-- garantizan que **el asiento y su firmante pertenezcan a la misma
-- institución**; no garantizan que esa afiliación sea legítima. Son dos
-- preguntas distintas y conviene no confundirlas.
-- ============================================================================

ALTER TABLE vet_professionals
  ADD CONSTRAINT vet_professionals_id_institution_key
  UNIQUE (id, institution_id);

COMMENT ON CONSTRAINT vet_professionals_id_institution_key
  ON vet_professionals IS
  'Redundante como unicidad (id ya es PK) y obligatoria como destino: las FK '
  'compuestas del schema erp sobre (created_by, institution_id) y sus hermanas '
  '(migración 115) necesitan una restricción única sobre exactamente este par. '
  'No la borres sin borrar antes esas claves.';

-- ROLLBACK
-- ALTER TABLE vet_professionals
--   DROP CONSTRAINT vet_professionals_id_institution_key;
--
-- El DROP falla mientras exista cualquier FK de la 115 apuntando al par, y eso
-- es correcto: revertir esta migración sin revertir aquella dejaría el schema
-- `erp` referenciando un destino inexistente. El orden de reversión es el
-- inverso al de aplicación — primero la 115, después esta.
