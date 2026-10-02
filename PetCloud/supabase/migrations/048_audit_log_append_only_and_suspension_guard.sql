-- ============================================================================
-- PetCloud — Migración 048: el historial de acciones es de solo alta de verdad,
-- y la guarda de suspensión cuenta administradores que puedan entrar
--
-- La verificación independiente del cambio `admin-team-management` encontró dos
-- agujeros en la 046. Los dos tienen el mismo origen: la protección se apoyó en
-- algo que `service_role` no obedece (RLS) o en un conteo que mide filas en vez
-- de medir la capacidad real de entrar al panel.
--
--   1. `admin_action_log` NO es append-only. La 046 confió únicamente en la
--      ausencia de políticas de INSERT/UPDATE/DELETE, pero `service_role` tiene
--      `rolbypassrls = t`: para ese rol la RLS ni se evalúa. Reproducido contra
--      el stack local: `UPDATE admin_action_log SET actor_label = '...'` cambió
--      las 47 filas y `DELETE FROM admin_action_log` las borró todas. Y esto no
--      es un rol teórico: este mismo cambio instancia la service role en su
--      propio código de aplicación (`src/features/admin/data/team.ts`,
--      `src/features/admin/actions/team-actions.ts`).
--      `admin-action-audit-log/spec.md` exige que "ningún camino de la
--      aplicación **ni ningún rol o función de la base**" pueda modificar o
--      borrar una fila, y su escenario nombra textualmente "una modificación
--      directa en la base". La prueba de auditoría que no sobrevive a la
--      service role no prueba nada: el punto entero de este cambio era tener
--      constancia de quién hizo qué.
--
--   2. La guarda del "último administrador" de `admin_set_account_suspension`
--      cuenta filas de `profiles` con `role = 'admin'`, sin mirar si esas otras
--      cuentas ya están suspendidas. Con dos admins A y B: A suspende a B
--      (queda "otro admin", permitido), y después B —cuyo JWT sigue siendo
--      válido, porque banear no revoca un token ya emitido— suspende a A.
--      PetCloud queda con cero administradores capaces de iniciar sesión y la
--      recuperación necesita acceso directo a la base. design.md lo dice con
--      todas las letras: "un panel que puede dejar afuera a su propio último
--      admin es la misma falla que la guarda existe para prevenir".
--
--   3. `protect_last_platform_admin` (046) tiene el MISMO defecto que (2), del
--      otro lado de la puerta: cuenta filas de `profiles`, no administradores
--      capaces de entrar. Y arreglar solo (2) no lo tapa — la secuencia sigue
--      siendo alcanzable por la interfaz normal, con un solo admin operando:
--      A y B son admins activos, A suspende a B (permitido, A sigue efectivo),
--      y después A se autorrevoca: la guarda cuenta a B, que está baneado, como
--      "el admin que queda", y autoriza. Cero administradores pueden entrar.
--      Reproducido contra el stack local: 2 admins por fila, 1 capaz de entrar,
--      0 después de la autorrevocación.
--
-- Migración nueva y no edición de la 046: las migraciones son solo-agregado
-- (`openspec/config.yaml` → `rules.apply`), y la 046 y la 047 ya están
-- aplicadas en local y en producción.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. protect_admin_action_log_append_only()
--
-- Mismo patrón que ya demostró funcionar una pantalla más allá:
-- `protect_last_platform_admin` (046) es un trigger **sin** `SECURITY DEFINER`
-- y **sin** ninguna tupla de exención, y la verificación confirmó que sostiene
-- el invariante tanto contra `service_role` como contra `postgres`. Un trigger
-- corre siempre, sea cual sea el rol; la RLS no. Por eso la protección
-- append-only tiene que vivir acá y no en la ausencia de políticas.
--
-- Sin `SECURITY DEFINER` a propósito: no hay ninguna decisión que dependa de
-- quién escribe, así que no hay razón para cambiar de identidad, y dejarlo como
-- definer solo abriría la puerta a que una exención futura se cuele por ese
-- lado. Sin tupla de exención por el mismo motivo que la 046: si `postgres`
-- estuviera eximido, nuestras propias RPC `SECURITY DEFINER` podrían reescribir
-- el historial, que es exactamente contra lo que el spec escribe la regla.
--
-- LA TRAMPA, y la única transición permitida
-- -------------------------------------------
-- `admin_action_log.actor_profile_id` es `REFERENCES profiles(id) ON DELETE SET
-- NULL`. Cuando se borra la cuenta de alguien que actuó, Postgres no borra la
-- fila de auditoría: le hace un **UPDATE** para poner esa columna en NULL. Un
-- `BEFORE UPDATE` que rechace todo sin excepción bloquearía esa cascada, y con
-- ella:
--   * `auth.admin.deleteUser` sobre cualquier admin que haya actuado alguna vez
--     (incluida la limpieza de las pruebas RLS), y
--   * el requisito "La fila de auditoría sobrevive al borrado de su propio
--     actor" del spec, que hoy se cumple y está cubierto por
--     `tests/rls/panel-administracion.test.ts` (tarea 1.20).
-- Es decir: cerrar el agujero a lo bruto rompería otro requisito del mismo
-- spec.
--
-- Por eso el UPDATE se permite en un solo caso, y se compara la fila entera:
-- `actor_profile_id` pasa de no-NULL a NULL **y** todo el resto de la fila
-- queda idéntico. La comparación se hace con `to_jsonb(NEW) -
-- 'actor_profile_id' = to_jsonb(OLD) - 'actor_profile_id'` en vez de enumerar
-- las diez columnas a mano, por una razón concreta y no por elegancia: si una
-- migración futura le agrega una columna a esta tabla, la lista escrita a mano
-- seguiría compilando y esa columna nueva quedaría **silenciosamente
-- modificable** — el peor modo de falla posible para una tabla cuyo valor es
-- ser inmutable. Con la comparación por jsonb, la columna nueva entra en la
-- igualdad sola, sin que nadie se acuerde de nada. El costo es un `to_jsonb`
-- por fila en un camino que corre únicamente al borrar una cuenta.
-- (`- 'actor_profile_id'::text` va casteado: sin el cast, el literal es de tipo
-- `unknown` y Postgres no puede elegir entre `jsonb - text` y `jsonb - integer`.)
--
-- DELETE se rechaza siempre: ninguna FK de esta tabla cascadea a un DELETE
-- —`actor_profile_id` es `SET NULL` y `target_id` no tiene FK a propósito
-- (046)— así que no hay ningún borrado legítimo que negar por error.
--
-- TRUNCATE va aparte porque un trigger `FOR EACH ROW` no lo ve: `TRUNCATE` no
-- produce filas, así que vaciar la tabla entera esquivaría todo lo de arriba.
-- Hoy nada en el repositorio trunca nada (verificado), pero dejar abierta la
-- variante más destructiva de "borrar filas" en la tabla que existe para no
-- perder filas sería raro. Alcanza con un trigger de sentencia.
-- ----------------------------------------------------------------------------
CREATE FUNCTION protect_admin_action_log_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'El historial de acciones del panel es de solo alta: no se puede vaciar la tabla.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'El historial de acciones del panel es de solo alta: no se puede borrar una fila ya escrita.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Única transición permitida: la cascada de `ON DELETE SET NULL` sobre
  -- actor_profile_id, con el resto de la fila intacto. Ver el encabezado.
  IF OLD.actor_profile_id IS NOT NULL
     AND NEW.actor_profile_id IS NULL
     AND to_jsonb(NEW) - 'actor_profile_id'::text
       = to_jsonb(OLD) - 'actor_profile_id'::text
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'El historial de acciones del panel es de solo alta: no se puede modificar una fila ya escrita.'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMENT ON FUNCTION protect_admin_action_log_append_only IS
  'Vuelve append-only a admin_action_log contra CUALQUIER rol, service_role y '
  'postgres incluidos: la ausencia de políticas de la 046 no alcanzaba porque '
  'service_role tiene rolbypassrls. A propósito NO SECURITY DEFINER y sin '
  'exenciones, igual que protect_last_platform_admin (046). Permite un único '
  'UPDATE: la cascada ON DELETE SET NULL sobre actor_profile_id con el resto '
  'de la fila idéntico, sin la cual borrar la cuenta de un actor rompería y '
  'con ella el requisito "la fila sobrevive al borrado del actor".';

CREATE TRIGGER admin_action_log_protect_append_only
  BEFORE UPDATE OR DELETE ON admin_action_log
  FOR EACH ROW EXECUTE FUNCTION protect_admin_action_log_append_only();

CREATE TRIGGER admin_action_log_protect_truncate
  BEFORE TRUNCATE ON admin_action_log
  FOR EACH STATEMENT EXECUTE FUNCTION protect_admin_action_log_append_only();

-- La 046 dejó escrito en el COMMENT de la tabla que lo append-only era la
-- ausencia de políticas. Ya no: la ausencia de políticas sigue estando, pero
-- quien sostiene el invariante es el trigger de arriba. Se reescribe el
-- comentario acá —no en la 046, que es intocable— para que quien lea el
-- esquema en vivo no se lleve la versión vieja.
COMMENT ON TABLE admin_action_log IS
  'Auditoría de acciones del panel de administración, solo-agregado. Escribe '
  'únicamente log_admin_action() (046), SECURITY DEFINER. Lo append-only lo '
  'sostiene el trigger admin_action_log_protect_append_only (048), no la mera '
  'ausencia de políticas: service_role tiene rolbypassrls y esa ausencia no lo '
  'frena. El único UPDATE que pasa es la cascada de actor_profile_id a NULL al '
  'borrarse la cuenta del actor.';

-- ----------------------------------------------------------------------------
-- 2. admin_set_account_suspension(p_profile_id, p_suspend)
--
-- `CREATE OR REPLACE` y no `DROP` + `CREATE`: la firma no cambia (mismos dos
-- parámetros, mismo `RETURNS BOOLEAN`), así que Postgres reemplaza el cuerpo y
-- conserva el `GRANT EXECUTE ... TO authenticated` de la 046. Es lo contrario
-- del caso de la 047, donde sumar una columna al `RETURNS TABLE` cambiaba el
-- tipo de retorno y obligaba al DROP —y con el DROP se perdía el GRANT, que
-- esa migración tuvo que volver a otorgar—. Acá no hace falta: se verificó
-- contra el stack local que después del REPLACE el ACL sigue diciendo
-- `authenticated=X/postgres`.
--
-- Lo que cambia son exactamente dos cosas del bloque de la guarda. Todo lo
-- demás —el `is_platform_admin()` como primera sentencia, el rechazo de la
-- autosuspensión, el `SECURITY DEFINER SET search_path = public`, el mensaje de
-- "no existe ninguna cuenta con ese id", la escritura de `banned_until` y la
-- llamada a `log_admin_action()`— queda igual, palabra por palabra.
--
--   (a) El conteo pasa a contar administradores que **puedan iniciar sesión**,
--       no filas de `profiles`. Se une a `auth.users` y se exige
--       `banned_until IS NULL OR banned_until <= now()`. Sin eso, un admin ya
--       suspendido sigue contando como "el otro admin que queda" y la guarda
--       autoriza la suspensión que deja a PetCloud sin nadie que pueda entrar.
--       De paso, esto vuelve la guarda alcanzable: con el conteo por filas era
--       literalmente inalcanzable, porque quien llama ya es un admin distinto
--       del objetivo y por lo tanto el conteo nunca daba 0.
--
--   (b) `pg_advisory_xact_lock(46046)` antes del conteo, que a esta función le
--       faltaba. **La misma clave que usa `protect_last_platform_admin`
--       (046:215), no una nueva**: revocar el rol y suspender la cuenta bajan
--       las dos el número de administradores efectivos, así que tienen que
--       serializarse entre sí y no solo cada una consigo misma. Con dos claves
--       distintas, una revocación y una suspensión concurrentes se leerían
--       mutuamente como "todavía queda el otro" y las dos confirmarían — la
--       misma carrera que el lock existe para cerrar, apenas disfrazada.
--       Se toma solo cuando de verdad hay algo que serializar (se está
--       suspendiendo a un admin), para no meter a cada suspensión de un dueño
--       en la cola del mismo lock.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_set_account_suspension(p_profile_id UUID, p_suspend BOOLEAN)
RETURNS BOOLEAN AS $$
DECLARE
  v_role user_role;
  v_target_label TEXT;
  v_other_admins INTEGER;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede suspender o reactivar una cuenta.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_suspend AND p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés suspender tu propia cuenta.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT p.role, p.first_name || ' ' || p.last_name || ' <' || u.email || '>'
  INTO v_role, v_target_label
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_profile_id;

  IF v_target_label IS NULL THEN
    RAISE EXCEPTION 'No existe ninguna cuenta con ese id.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF p_suspend AND v_role = 'admin' THEN
    -- Misma clave que la guarda de revocación: ver (b) en el encabezado.
    PERFORM pg_advisory_xact_lock(46046);

    -- Administradores que además pueden entrar: un admin baneado no sostiene
    -- el invariante, aunque su fila siga diciendo 'admin'.
    SELECT count(*) INTO v_other_admins
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'admin'
      AND p.id <> p_profile_id
      AND (u.banned_until IS NULL OR u.banned_until <= now());

    IF v_other_admins = 0 THEN
      RAISE EXCEPTION
        'PetCloud quedaría sin ningún administrador: no se puede suspender al único.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  UPDATE auth.users
  SET banned_until = CASE WHEN p_suspend THEN now() + interval '100 years' ELSE NULL END
  WHERE id = p_profile_id;

  PERFORM log_admin_action(
    CASE WHEN p_suspend THEN 'account_suspended' ELSE 'account_reactivated' END,
    'profile', p_profile_id, v_target_label, '{}'::jsonb
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION admin_set_account_suspension IS
  'Suspende o reactiva una cuenta escribiendo auth.users.banned_until, y deja '
  'su fila en admin_action_log en la misma transacción. Desde la 048 la guarda '
  'del último admin cuenta solo administradores que puedan iniciar sesión '
  '(banned_until nulo o vencido) y toma pg_advisory_xact_lock(46046), la misma '
  'clave que protect_last_platform_admin: revocar y suspender bajan las dos el '
  'número de administradores efectivos y tienen que serializarse entre sí.';

-- ----------------------------------------------------------------------------
-- 3. count_effective_platform_admins() + protect_last_platform_admin()
--
-- El mismo defecto que (2), del otro lado: la guarda de revocación cuenta filas
-- de `profiles` en vez de administradores que puedan entrar. Arreglar solo la
-- suspensión no alcanza — ver (3) en el encabezado para la secuencia completa.
--
-- POR QUÉ UNA FUNCIÓN AUXILIAR Y NO EL JOIN ADENTRO DEL TRIGGER
-- --------------------------------------------------------------
-- `protect_last_platform_admin` es, a propósito, **sin** `SECURITY DEFINER` y
-- **sin** tupla de exención: corre con la identidad de quien de verdad escribe,
-- que es lo que le permite frenar también a `service_role` y a `postgres`. Esa
-- misma virtud es el problema acá: si el trigger hiciera `JOIN auth.users`
-- directo, la consulta correría como el rol que escribe, y `authenticated` no
-- tiene permiso de lectura sobre `auth.users`. Un `UPDATE` crudo desde el
-- navegador dejaría de recibir el mensaje de la guarda y recibiría un
-- "permission denied for table users" — un error peor, por un camino que además
-- ya está cerrado por `protect_profile_role` (001).
--
-- Con la auxiliar `SECURITY DEFINER`, la lectura de `auth.users` siempre ocurre
-- como `postgres`, sin importar quién disparó el trigger, y el trigger sigue
-- siendo no-definer y sin exenciones. Lo único que se expone es un entero: la
-- cantidad de administradores efectivos. No es un dato sensible.
--
-- El `GRANT` es explícito y no se deja librado a los default privileges: el
-- trigger corre como quien escribe, así que cada rol que pueda llegar hasta él
-- necesita `EXECUTE`. `supabase_auth_admin` está en la lista porque el borrado
-- de una cuenta cascadea a `profiles` y dispara esta misma guarda.
-- ----------------------------------------------------------------------------
CREATE FUNCTION count_effective_platform_admins(p_exclude UUID)
RETURNS INTEGER AS $$
  SELECT count(*)::INTEGER
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'admin'
    AND p.id <> p_exclude
    AND (u.banned_until IS NULL OR u.banned_until <= now());
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION count_effective_platform_admins(UUID)
  TO authenticated, service_role, supabase_auth_admin;

COMMENT ON FUNCTION count_effective_platform_admins IS
  'Administradores que además pueden iniciar sesión (banned_until nulo o '
  'vencido), excluyendo un perfil. Existe como función SECURITY DEFINER para '
  'que protect_last_platform_admin (no-definer, sin exenciones) pueda leer '
  'auth.users sin que un UPDATE crudo de authenticated choque contra un '
  'permission denied en vez de recibir el mensaje de la guarda.';

-- El cuerpo es el de la 046 con un solo cambio: el conteo por filas pasa a ser
-- `count_effective_platform_admins`. `CREATE OR REPLACE` conserva el trigger
-- `profiles_protect_last_admin` de la 046, que sigue apuntando a esta función.
CREATE OR REPLACE FUNCTION protect_last_platform_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role <> 'admin' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(46046);

  -- Antes: count(*) sobre profiles. Un admin baneado contaba como "el que
  -- queda" y dejaba pasar la revocación que vacía el panel.
  IF count_effective_platform_admins(OLD.id) = 0 THEN
    RAISE EXCEPTION
      'PetCloud quedaría sin ningún administrador. Designá otro antes de revocar o eliminar a este.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMENT ON FUNCTION protect_last_platform_admin IS
  'Guarda del último administrador de la plataforma. A propósito NO SECURITY '
  'DEFINER y sin ninguna exención de current_user — divergencia deliberada de '
  'protect_last_municipality_admin (020): acá bloquear auth.admin.deleteUser '
  'sobre el único admin es el requisito, no el defecto. Desde la 048 cuenta '
  'administradores capaces de iniciar sesión, vía count_effective_platform_'
  'admins, y no filas de profiles.';

-- ============================================================================
-- ROLLBACK
--
-- Orden: primero los triggers, después la función que ejecutan. La tabla no se
-- toca: `admin_action_log` es de la 046 y tiene que seguir existiendo.
--
-- El segundo bloque NO es un DROP: `admin_set_account_suspension` tiene que
-- seguir existiendo, porque `Usuarios` la usa desde la 046. Revertir esta
-- migración significa reponer el cuerpo de la 046 —el del conteo por filas de
-- `profiles`, sin JOIN a `auth.users` y sin advisory lock— tal cual está
-- escrito en `046_admin_team_and_audit.sql`. Mismo criterio que la 047 y que la
-- 038: cuando lo que cambia es el cuerpo de una función, el rollback es reponer
-- el cuerpo viejo, no borrar la función. No hace falta volver a otorgar el
-- GRANT: `CREATE OR REPLACE` no lo pierde, ni al aplicar ni al revertir.
--
-- Revertir el primer bloque deja la tabla exactamente como estaba antes de la
-- 048: append-only frente a `anon`/`authenticated` por ausencia de políticas, y
-- modificable por `service_role` y `postgres`. Es el estado que esta migración
-- existe para corregir; revertirla es reabrir ese agujero a conciencia.
-- ============================================================================
-- El tercer bloque se revierte igual que el segundo: reponer el cuerpo de
-- `protect_last_platform_admin` de la 046 —el del `count(*)` sobre `profiles`—
-- con CREATE OR REPLACE, y recién después borrar la auxiliar, que queda sin
-- llamadores. Al igual que arriba, revertirlo reabre el bloqueo mutuo a
-- conciencia.
-- ============================================================================
-- DROP TRIGGER IF EXISTS admin_action_log_protect_truncate ON admin_action_log;
-- DROP TRIGGER IF EXISTS admin_action_log_protect_append_only ON admin_action_log;
-- DROP FUNCTION IF EXISTS protect_admin_action_log_append_only();
-- (después, el CREATE FUNCTION admin_set_account_suspension(UUID, BOOLEAN)
--  de la 046, con CREATE OR REPLACE, tal cual está en esa migración)
-- (después, el CREATE FUNCTION protect_last_platform_admin() de la 046, con
--  CREATE OR REPLACE, tal cual está en esa migración)
-- DROP FUNCTION IF EXISTS count_effective_platform_admins(UUID);
