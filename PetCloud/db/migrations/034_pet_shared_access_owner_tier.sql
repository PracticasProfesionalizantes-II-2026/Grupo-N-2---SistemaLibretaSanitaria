-- ============================================================================
-- PetCloud — Migración 034: nivel "owner" en share_permission
--
-- Primer paso de pasar la relación dueño↔mascota de 1:N a N:N (varios dueños
-- por mascota). La decisión de arquitectura: en vez de una tabla `pet_owners`
-- nueva y en paralelo a `pet_shared_access` (que ya resuelve "quién está
-- conectado a esta mascota y con qué nivel"), se extiende esa misma tabla con
-- un tercer nivel. `owner` no es un concepto aparte de `view`/`edit`: es una
-- escalera de capacidad — quien es dueño puede todo lo que puede editar, más
-- borrar la mascota y gestionar quién más tiene acceso.
--
-- Va en su propia migración, separada de la 035 que la usa: `ALTER TYPE ...
-- ADD VALUE` no puede usarse en la misma transacción en la que se agrega —
-- Postgres exige que el nuevo valor ya esté confirmado antes de aparecer en
-- una comparación, un `WHERE`, o el cuerpo de una función. Partirlo en dos
-- migraciones es la forma estándar de evitarlo, no una precaución de más.
-- ============================================================================

ALTER TYPE share_permission ADD VALUE 'owner' AFTER 'edit';

-- ROLLBACK
-- Postgres no permite quitarle un valor a un enum. Si hiciera falta deshacer
-- esto, la única forma real es recrear el tipo entero (crear share_permission
-- nuevo sin 'owner', migrar las columnas, borrar el viejo) — no hay un DROP
-- VALUE. No se documenta un rollback de una sola sentencia porque no existe.
