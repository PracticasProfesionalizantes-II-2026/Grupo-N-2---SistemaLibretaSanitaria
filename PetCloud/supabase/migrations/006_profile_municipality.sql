-- ============================================================================
-- PetCloud — Migración 006: la jurisdicción declarada, en el perfil
--
-- Es la última columna que le falta al panel del dueño para dejar de leer datos
-- de ejemplo. Hoy el municipio vive en `localStorage` (`petcloud:municipio`),
-- que fue una solución de transición mientras no había backend y tiene un
-- problema concreto: se pierde al cambiar de navegador o de teléfono. Alguien de
-- Rafaela que entra desde la computadora del trabajo vería las campañas de
-- Vicente López, que es el valor por defecto.
--
-- Es `TEXT` y no una clave foránea a propósito: los municipios todavía viven en
-- `features/municipality/data/municipalities.ts`, no en la base. Cuando esa
-- tabla exista (fase del panel municipal), esto pasa a ser una FK con su
-- migración propia. Poner una FK ahora obligaría a crear la tabla de municipios
-- fuera de su fase, con la mitad de sus columnas sin decidir.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN municipality_id TEXT;

COMMENT ON COLUMN profiles.municipality_id IS
  'Jurisdicción declarada: decide qué campañas, ordenanza y vacunas obligatorias ve. La ubicación del navegador sugiere, no cambia esto.';

-- No hacen falta políticas nuevas: es una columna más de `profiles`, y las de la
-- migración 001 ya dejan a cada quien leer y editar su propia fila. El trigger
-- `profiles_protect_role` sigue cubriendo lo único que no puede tocarse, que es
-- el rol.
