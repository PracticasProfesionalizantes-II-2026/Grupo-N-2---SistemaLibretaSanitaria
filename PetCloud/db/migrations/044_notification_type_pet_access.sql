-- ============================================================================
-- PetCloud — Migración 044: valor 'pet_access' en notification_type
--
-- Primer paso de las notificaciones de acceso compartido a mascotas (coautoría
-- por invitación): antes de poder usar `pet_access` en cualquier INSERT o
-- función, el valor tiene que existir confirmado en el enum. Mismo motivo que
-- ya documentó la 034 para `share_permission`: `ALTER TYPE ... ADD VALUE` no
-- puede usarse en la misma transacción en la que se agrega — Postgres exige
-- que el nuevo valor ya esté confirmado antes de aparecer en una comparación,
-- un `WHERE`, o el cuerpo de una función. Por eso va en su propia migración,
-- separada de la 045 que lo usa.
-- ============================================================================

ALTER TYPE notification_type ADD VALUE 'pet_access' AFTER 'lost_pet';

-- ROLLBACK
-- Postgres no permite quitarle un valor a un enum. Si hiciera falta deshacer
-- esto, la única forma real es recrear el tipo entero (crear notification_type
-- nuevo sin 'pet_access', migrar la columna, borrar el viejo) — no hay un DROP
-- VALUE. No se documenta un rollback de una sola sentencia porque no existe.
-- Las filas type='pet_access' que ya existan quedan con su significado
-- intacto: los mapas `TIPO_NOTIF`/`ICONS` del lado de la app deben seguir
-- reconociendo el valor para que esas filas sigan siendo renderizables.
