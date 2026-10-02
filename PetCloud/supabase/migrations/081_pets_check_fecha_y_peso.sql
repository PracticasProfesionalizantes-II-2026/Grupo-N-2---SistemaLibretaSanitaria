-- ============================================================================
-- PetCloud — Migración 081: fecha de nacimiento y peso con límites en la base
--
-- El formulario ya validaba "no nacida en el futuro" y "peso razonable", pero
-- solo en el navegador. Hasta el PR #142 las Server Actions guardaban lo que
-- llegara, y en producción quedaron una mascota nacida en 2047 ("-21 años") y
-- otra de 156,5 kg. Ahora el servidor valida con el mismo schema de Zod; esta
-- migración pone la última barrera en la base, para cualquier camino que no
-- pase por esas acciones (RPC, service role, un script).
--
-- Las reglas son las del schema (src/features/owner/schemas/pet-schema.ts):
--
--   · date_of_birth <= CURRENT_DATE
--   · 0 < weight <= 100 (kg), en pets.weight y en weight_records.value
--
-- ----------------------------------------------------------------------------
-- Por qué NOT VALID
-- ----------------------------------------------------------------------------
--
-- `ADD CONSTRAINT ... CHECK` recorre la tabla y valida cada fila existente. Con
-- las filas malas de producción, el ALTER fallaría con 23514, y como mergear a
-- master aplica la migración sola, el deploy se frenaría sobre un archivo que
-- ya no se puede editar.
--
-- A diferencia de la 052, acá no hay un dato verdadero con el que reparar: no
-- sabemos cuándo nació la mascota de 2047 ni cuánto pesa la de 156 kg, y
-- poner NULL o un número inventado sería decidir por el dueño. Así que el
-- CHECK entra NOT VALID: vale para toda escritura nueva (INSERT y UPDATE de la
-- fila, incluidas las viejas cuando alguien las edite) y no revisa lo que ya
-- está. La interfaz ya muestra "Edad desconocida" en vez de edades negativas
-- (PR #142), y el dueño corrige el dato la próxima vez que edite la mascota,
-- porque el formulario no le deja guardar el valor imposible.
--
-- Cuando las filas viejas estén corregidas, alcanza con
-- `ALTER TABLE ... VALIDATE CONSTRAINT ...` para que pase a ser una garantía
-- sobre toda la tabla. La consulta para encontrarlas está al final.
--
-- El CHECK de la fecha usa CURRENT_DATE, que no es inmutable. Es seguro por la
-- misma razón que explica la 052: la condición es monótona (lo que hoy no es
-- futuro tampoco lo será mañana), así que un restore nunca encuentra rota una
-- fila que pasó.
-- ============================================================================

ALTER TABLE pets
  ADD CONSTRAINT pets_nacimiento_no_futuro
  CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE) NOT VALID;

ALTER TABLE pets
  ADD CONSTRAINT pets_peso_en_rango
  CHECK (weight IS NULL OR (weight > 0 AND weight <= 100)) NOT VALID;

ALTER TABLE weight_records
  ADD CONSTRAINT weight_records_peso_en_rango
  CHECK (value > 0 AND value <= 100) NOT VALID;

-- Filas que todavía no cumplen (para corregirlas antes de VALIDATE):
--
--   SELECT id, name, date_of_birth, weight FROM pets
--   WHERE date_of_birth > CURRENT_DATE OR weight <= 0 OR weight > 100;
--
--   SELECT id, pet_id, value, recorded_at FROM weight_records
--   WHERE value <= 0 OR value > 100;

-- ROLLBACK
-- ALTER TABLE weight_records DROP CONSTRAINT IF EXISTS weight_records_peso_en_rango;
-- ALTER TABLE pets DROP CONSTRAINT IF EXISTS pets_peso_en_rango;
-- ALTER TABLE pets DROP CONSTRAINT IF EXISTS pets_nacimiento_no_futuro;
