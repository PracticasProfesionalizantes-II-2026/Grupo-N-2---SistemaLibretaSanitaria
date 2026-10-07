-- ============================================================================
-- PetCloud — Migración 061: las métricas del panel, contadas en Postgres
--
-- De los trece elementos que mostraba `/admin/panel`, doce eran fixtures. Las
-- "19.870 cuentas" eran un número escrito a mano en un array de TypeScript. El
-- único dato real era la lista de tickets.
--
-- POR QUÉ UNA RPC DE AGREGACIÓN Y NO CONTAR EN NODE
--
-- Las dos RPC que ya existen —`admin_user_directory()` y
-- `admin_organization_directory()` (046)— devuelven **filas crudas, todas**.
-- Contar sobre ellas en el servidor de Next significa traer el padrón entero
-- por la red para mostrar un número. Con doscientas cuentas no se nota; con
-- veinte mil el panel tarda segundos, y eso pasa justo cuando el panel empieza
-- a importar. Un `count(*)` en Postgres no mueve una sola fila.
--
-- Y hay un motivo de corrección además del de costo: contar en Node obliga a
-- que la sesión pueda LEER cada fila que cuenta. `profiles` tiene SELECT
-- restringido a la propia fila, así que el conteo saldría 1. Este es el mismo
-- problema que ya resolvieron las dos RPC de la 046, y la respuesta es la
-- misma: `SECURITY DEFINER` con `is_platform_admin()` como primera sentencia.
--
-- LO QUE ESTA FUNCIÓN NO DEVUELVE, Y ES DELIBERADO
--
-- Nada de uptime, tiempo de respuesta, errores por hora ni último incidente.
-- El panel los mostraba (99,94%, 214 ms, 3 errores) y **no hay de dónde
-- sacarlos**: no hay APM, no hay monitor de disponibilidad, y no existe una
-- tabla de errores de aplicación. `admin_action_log` no sirve para eso — es la
-- auditoría de acciones de administrador, no un log de errores.
--
-- Un panel de administración que muestra un uptime inventado es peor que uno
-- que no lo muestra, porque alguien va a decidir algo con ese número. Se
-- eliminan. Si mañana hace falta observabilidad de verdad, es un ciclo propio
-- con una fuente real detrás, no una fila más en esta función.
--
-- `STABLE` y no `VOLATILE`: no escribe nada. No audita en `admin_action_log` a
-- propósito — mirar el panel no es una acción administrativa, y una fila de
-- auditoría por cada carga de pantalla ahogaría el historial que sí importa.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_platform_metrics()
RETURNS JSONB AS $$
DECLARE
  v_inicio_mes TIMESTAMPTZ := date_trunc('month', now());
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador de plataforma puede leer las métricas'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'cuentas_totales', (SELECT count(*) FROM profiles),
    'altas_del_mes',
      (SELECT count(*) FROM profiles WHERE created_at >= v_inicio_mes),

    -- Se emiten los cuatro roles siempre, incluso en cero: un gráfico al que
    -- le falta la barra de "municipio" parece un gráfico roto, no un cero.
    'por_rol', (
      SELECT jsonb_agg(fila ORDER BY fila->>'rol')
      FROM (
        SELECT jsonb_build_object(
                 'rol', r.rol,
                 'total', (SELECT count(*) FROM profiles p WHERE p.role = r.rol)
               ) AS fila
        FROM unnest(ARRAY['owner', 'vet', 'municipality', 'admin']::user_role[])
          AS r(rol)
      ) roles
    ),

    'mascotas', (SELECT count(*) FROM pets),
    'veterinarias', (SELECT count(*) FROM vet_institutions),
    'municipios', (SELECT count(*) FROM municipalities),

    -- Mismo filtro que la lista de `/admin/validaciones` y que el índice
    -- parcial de la 060. Si los dos criterios se separaran, la tarjeta diría
    -- un número y la pantalla mostraría otro, que es la peor forma de fallar
    -- de un tablero.
    'matriculas_pendientes', (
      SELECT count(*) FROM vet_professionals
      WHERE license_reviewed_at IS NULL AND removed_at IS NULL
    ),

    'veterinarias_premium', (
      SELECT count(*) FROM vet_subscriptions WHERE status = 'authorized'
    ),

    'mensajes_contacto', (SELECT count(*) FROM contact_messages),

    -- Doce meses de altas, con los meses vacíos en cero. `generate_series` y
    -- no un `GROUP BY` a secas: agrupar solo devuelve los meses que tuvieron
    -- altas, y un gráfico que se saltea agosto porque nadie se registró
    -- dibuja una línea que miente sobre la pendiente.
    'altas_por_mes', (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'mes', to_char(m.mes, 'YYYY-MM'),
                 'altas', (
                   SELECT count(*) FROM profiles p
                   WHERE p.created_at >= m.mes
                     AND p.created_at < m.mes + INTERVAL '1 month'
                 )
               ) ORDER BY m.mes
             )
      FROM generate_series(
             date_trunc('month', now()) - INTERVAL '11 months',
             date_trunc('month', now()),
             INTERVAL '1 month'
           ) AS m(mes)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION admin_platform_metrics IS
  'Metricas agregadas del backoffice, contadas en Postgres en un solo viaje. '
  'No devuelve salud del servicio: no hay fuente real de uptime ni de errores '
  'de aplicacion, y un numero inventado en un tablero de decision es peor que '
  'ningun numero.';

REVOKE EXECUTE ON FUNCTION admin_platform_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_platform_metrics() TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION admin_platform_metrics() FROM authenticated;
-- DROP FUNCTION IF EXISTS admin_platform_metrics();
