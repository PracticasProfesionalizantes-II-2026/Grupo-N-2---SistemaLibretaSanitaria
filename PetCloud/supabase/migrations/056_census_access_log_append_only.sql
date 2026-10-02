-- ============================================================================
-- PetCloud — Migración 056: la auditoría del padrón es de solo alta de verdad
--
-- La 023 escribió, con todas las letras, que `municipality_census_access_log`
-- es append-only «porque no tiene ninguna política de INSERT, UPDATE ni DELETE
-- para ningún rol autenticado» (023:104-107). Esa es exactamente la suposición
-- que la 046 hizo sobre `admin_action_log` y que la 048 tuvo que corregir: la
-- ausencia de políticas no frena a `service_role`, porque ese rol tiene
-- `rolbypassrls = t` y para él la RLS ni se evalúa. La 048 lo reprodujo contra
-- el stack local sobre la otra tabla: un `UPDATE` cambió las 47 filas y un
-- `DELETE` las borró todas.
--
-- Las dos tablas nacieron del mismo molde —la 046 lo dice: «mismo patrón que
-- `municipality_census_access_log` (023)»— así que heredaron el mismo agujero.
-- La 048 lo cerró de un solo lado. Esta migración cierra el otro.
--
-- Y acá el agujero muerde más fuerte, no menos: esta tabla es la única
-- constancia de quién miró datos personales de vecinos y quién se bajó el
-- padrón entero. Una auditoría que se cree inmutable y no lo es es peor que no
-- tenerla, porque se le cree.
--
-- Migración nueva y no edición de la 023 ni de la 051: las migraciones son
-- solo-agregado (`openspec/config.yaml` → `rules.apply`), y las dos ya están
-- aplicadas en local y en producción.
--
-- ----------------------------------------------------------------------------
-- LA TRAMPA: acá las transiciones legítimas a NULL son DOS, no una
-- ----------------------------------------------------------------------------
--
-- `admin_action_log` tenía una sola FK que cascadea con `SET NULL`, y por eso
-- la 048 pudo permitir un único UPDATE. Esta tabla tiene dos:
--
--   · `actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL`
--     (023:52) — se anula al borrarse la cuenta del funcionario que consultó.
--   · `pet_id UUID REFERENCES pets(id) ON DELETE SET NULL` (023:57) — se anula
--     al borrarse la mascota consultada.
--
-- Las dos producen un **UPDATE** sobre esta tabla desde adentro de un DELETE
-- ajeno. Un `BEFORE UPDATE` que rechace todo sin excepción rompería las dos
-- cascadas, y con ellas:
--
--   * el borrado de la cuenta de cualquier funcionario municipal que haya
--     consultado una ficha alguna vez, y
--   * el borrado de la cuenta de cualquier dueño cuya mascota haya sido
--     consultada — que es **literalmente el bug que la 051 acaba de arreglar**,
--     recreado en forma de trigger. La 051 quitó un CHECK que abortaba ese
--     DELETE con SQLSTATE 23514; un trigger ciego lo volvería a abortar, ahora
--     con `restrict_violation`. Hay una prueba viva que lo atraparía
--     (`tests/rls/padron-municipal.test.ts`, «borrar la cuenta del dueño no
--     falla, y la fila de auditoría queda»), pero el punto es no escribirlo mal
--     de entrada.
--
-- Por eso el UPDATE se permite bajo tres condiciones simultáneas:
--
--   1. Todo lo que NO sea `pet_id` ni `actor_profile_id` queda idéntico. La
--      comparación va con `to_jsonb(NEW) - 'pet_id' - 'actor_profile_id'`
--      contra lo mismo sobre OLD, en vez de enumerar las trece columnas a mano,
--      por la misma razón que la 048: si una migración futura le agrega una
--      columna a esta tabla, la lista escrita a mano seguiría compilando y esa
--      columna nueva quedaría **silenciosamente modificable**. Con jsonb, la
--      columna nueva entra en la igualdad sola. (Los literales van casteados a
--      `text`: sin el cast son de tipo `unknown` y Postgres no puede elegir
--      entre `jsonb - text` y `jsonb - integer`.)
--   2. Cada una de esas dos columnas, o no se tocó, o pasó de no-NULL a NULL.
--      Nunca de NULL a un valor, nunca de un valor a otro valor: eso sería
--      reescribir a quién apunta la auditoría, no perder la referencia.
--   3. Al menos una de las dos cambió de verdad. Un UPDATE que no transiciona
--      nada no es una cascada, es alguien escribiendo sobre la tabla.
--
-- Se permiten las dos en la misma sentencia aunque hoy ninguna cascada las
-- dispare juntas: cuesta nada y la regla queda expresada por columna en vez de
-- por accidente de qué DELETE corrió.
--
-- ----------------------------------------------------------------------------
-- DELETE: siempre se rechaza, y acá eso SÍ tiene una consecuencia
-- ----------------------------------------------------------------------------
--
-- En `admin_action_log` rechazar todo DELETE era gratis: ninguna FK de esa
-- tabla cascadeaba a un borrado. Acá sí hay una:
-- `municipality_id UUID REFERENCES municipalities(id) ON DELETE CASCADE`
-- (023:51). Con este trigger, **borrar un municipio que tenga auditoría escrita
-- deja de funcionar**, y falla con `restrict_violation`.
--
-- Es deliberado y es la respuesta correcta: si el CASCADE sigue vivo, cualquiera
-- que pueda borrar el municipio puede borrar con él la constancia de todo lo que
-- se miró desde ese municipio. Un botón de «borrar auditoría» disfrazado de
-- baja administrativa.
--
-- Qué se rompe hoy, verificado en el repositorio y no supuesto:
--
--   · `src/features/auth/actions/register-actions.ts:296` borra un municipio
--     en el rollback de un registro fallido — un municipio creado segundos
--     antes, sin una sola fila de auditoría. El trigger no llega a dispararse.
--   · Las pruebas RLS nunca borran municipios: `limpiar()`
--     (`tests/rls/helpers.ts:357`) solo da de baja usuarios.
--   · No existe ninguna otra ruta de borrado de municipios en la aplicación.
--
-- O sea: nada de lo que hoy funciona deja de funcionar. Y si mañana hace falta
-- dar de baja un municipio con historial, eso necesita una decisión de producto
-- explícita (¿se archiva?, ¿se anonimiza?, ¿quién autoriza?), no una cascada
-- silenciosa. Que se frene acá y obligue a esa conversación es la función.
--
-- TRUNCATE va en su propio trigger de sentencia por lo mismo que en la 048: un
-- trigger `FOR EACH ROW` no lo ve, porque TRUNCATE no produce filas, y vaciar
-- la tabla entera esquivaría todo lo de arriba.
--
-- Sin `SECURITY DEFINER` y sin ninguna tupla de exención, igual que la 048 y
-- que `protect_last_platform_admin` (046): un trigger corre siempre, sea cual
-- sea el rol, y eso es todo lo que se necesita. Eximir a `postgres` dejaría que
-- nuestras propias RPC `SECURITY DEFINER` reescriban el historial, que es
-- exactamente lo que esta migración existe para impedir.
-- ============================================================================

CREATE FUNCTION protect_census_access_log_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'La auditoría del padrón es de solo alta: no se puede vaciar la tabla.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'La auditoría del padrón es de solo alta: no se puede borrar una fila ya escrita.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Únicas transiciones permitidas: las cascadas de `ON DELETE SET NULL` sobre
  -- `pet_id` y `actor_profile_id`, con el resto de la fila intacto y con al
  -- menos una de las dos transicionando de verdad. Ver el encabezado.
  IF to_jsonb(NEW) - 'pet_id'::text - 'actor_profile_id'::text
       = to_jsonb(OLD) - 'pet_id'::text - 'actor_profile_id'::text
     AND (
       NEW.pet_id IS NOT DISTINCT FROM OLD.pet_id
       OR (OLD.pet_id IS NOT NULL AND NEW.pet_id IS NULL)
     )
     AND (
       NEW.actor_profile_id IS NOT DISTINCT FROM OLD.actor_profile_id
       OR (OLD.actor_profile_id IS NOT NULL AND NEW.actor_profile_id IS NULL)
     )
     AND (
       NEW.pet_id IS DISTINCT FROM OLD.pet_id
       OR NEW.actor_profile_id IS DISTINCT FROM OLD.actor_profile_id
     )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'La auditoría del padrón es de solo alta: no se puede modificar una fila ya escrita.'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMENT ON FUNCTION protect_census_access_log_append_only IS
  'Vuelve append-only a municipality_census_access_log contra CUALQUIER rol, '
  'service_role y postgres incluidos: la ausencia de políticas de la 023 no '
  'alcanzaba porque service_role tiene rolbypassrls. Mismo patrón que la 048 '
  'para admin_action_log, con DOS transiciones permitidas en vez de una: las '
  'cascadas ON DELETE SET NULL sobre pet_id y actor_profile_id, con el resto '
  'de la fila idéntico. Rechazar la de pet_id recrearía el bug que la 051 '
  'arregló. A propósito NO SECURITY DEFINER y sin exenciones.';

CREATE TRIGGER census_access_log_protect_append_only
  BEFORE UPDATE OR DELETE ON municipality_census_access_log
  FOR EACH ROW EXECUTE FUNCTION protect_census_access_log_append_only();

CREATE TRIGGER census_access_log_protect_truncate
  BEFORE TRUNCATE ON municipality_census_access_log
  FOR EACH STATEMENT EXECUTE FUNCTION protect_census_access_log_append_only();

-- La 023 dejó escrito en el COMMENT de la tabla que lo append-only era la
-- ausencia de políticas. Ya no: la ausencia de políticas sigue estando, pero
-- quien sostiene el invariante es el trigger de arriba. Se reescribe acá —no en
-- la 023, que es intocable— para que quien lea el esquema en vivo no se lleve
-- la versión vieja. Mismo movimiento que la 048 hizo sobre el COMMENT de la
-- 046.
COMMENT ON TABLE municipality_census_access_log IS
  'Auditoría de acceso al padrón, solo-agregado. Escriben únicamente los '
  'cuerpos SECURITY DEFINER de municipality_census_record/export (023). Lo '
  'append-only lo sostiene el trigger census_access_log_protect_append_only '
  '(056), no la mera ausencia de políticas: service_role tiene rolbypassrls y '
  'esa ausencia no lo frena. Los únicos UPDATE que pasan son las cascadas de '
  'pet_id y actor_profile_id a NULL al borrarse la mascota o la cuenta del '
  'funcionario. DELETE se rechaza siempre, incluida la cascada de borrar el '
  'municipio.';

-- ROLLBACK
-- DROP TRIGGER IF EXISTS census_access_log_protect_truncate ON municipality_census_access_log;
-- DROP TRIGGER IF EXISTS census_access_log_protect_append_only ON municipality_census_access_log;
-- DROP FUNCTION IF EXISTS protect_census_access_log_append_only();
--
-- Los triggers van antes que la función: al revés, el DROP FUNCTION sin CASCADE
-- falla porque los triggers todavía dependen de ella. El COMMENT de la tabla
-- queda con el texto de arriba a propósito: describe el estado al que se
-- vuelve solo si además se revierte esta línea a mano, y es preferible un
-- comentario que sobrevive a la reversión que uno que miente en la dirección
-- contraria.
