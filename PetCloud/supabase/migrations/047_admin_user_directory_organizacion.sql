-- ============================================================================
-- PetCloud — Migración 047: `admin_user_directory()` devuelve la organización
--
-- `admin-directory-management/spec.md` pide que la búsqueda de `Usuarios`
-- opere sobre nombre, email **y organización**, pero `admin_user_directory()`
-- (046) no devuelve ninguna columna de organización: el panel quedó sin ese
-- criterio y sin esa columna en la tabla. Esta migración la agrega al final
-- del `RETURNS TABLE`, sin tocar nada más del cuerpo.
--
-- Por qué una migración nueva y no una edición de la 046: las migraciones son
-- solo-agregado (`openspec/config.yaml` → `rules.apply`), y la 046 ya está
-- aplicada en producción. Editarla dejaría a las bases existentes con una
-- función que no coincide con su propio archivo.
--
-- Por qué DROP + CREATE y no `CREATE OR REPLACE` a secas: las columnas de un
-- `RETURNS TABLE` son parámetros OUT, así que sumar una cambia el tipo de
-- retorno de la función, y `CREATE OR REPLACE FUNCTION` no puede cambiarlo
-- ("cannot change return type of existing function"). El DROP también se
-- lleva el `GRANT EXECUTE`, por eso hay que volver a otorgarlo abajo — no es
-- un permiso nuevo, es el mismo de la 046 restituido.
--
-- De dónde sale la organización, verificado contra el esquema:
--   * veterinarios → `vet_professionals.profile_id` → `vet_institutions.name`
--     por `institution_id` (001:150 y 001:175);
--   * municipio    → `municipality_staff.profile_id` → `municipalities.name`
--     por `municipality_id` (017:94);
--   * dueños y admins → NULL: no pertenecen a ninguna organización, y eso es
--     un dato, no un faltante.
-- Los dos son `LEFT JOIN` y se resuelven con un `COALESCE`: una cuenta que no
-- está en ninguna de las dos tablas tiene que seguir apareciendo en el
-- directorio. Un `JOIN` liso la haría desaparecer, que es justo lo contrario
-- de lo que un directorio de cuentas tiene que hacer. El orden del `COALESCE`
-- fija la precedencia para el caso raro pero posible de que un mismo perfil
-- esté en las dos tablas: gana la veterinaria, porque `profiles.role` de esa
-- cuenta va a ser 'vet' y es por su institución que aparece en el panel.
--
-- Por qué el lado veterinario va por LATERAL con `LIMIT 1` y el municipal no:
-- `municipality_staff` tiene `UNIQUE (profile_id)` (017:105), así que un
-- `LEFT JOIN` liso no puede devolver más de una fila por perfil. En cambio
-- `vet_professionals` solo es única por `license_number`: nada en el esquema
-- impide que un mismo perfil tenga dos fichas profesionales, y con un JOIN
-- liso esa cuenta aparecería **dos veces** en `Usuarios` — una fila duplicada
-- en el directorio del panel, no un detalle estético. El LATERAL con
-- `LIMIT 1` garantiza cero o una fila por perfil por construcción; es el
-- mismo remedio, por el mismo motivo, que la 038 ya aplicó a las nueve
-- funciones municipales cuando los codueños N:N empezaron a duplicar
-- mascotas. El `ORDER BY vp.created_at ASC, vp.id ASC` lo vuelve
-- determinístico —gana la ficha más antigua, con desempate estable— en vez de
-- depender de la fila que la base devuelva primero.
--
-- La assertion `is_platform_admin()` sigue siendo la **primera** sentencia
-- del cuerpo, antes de cualquier SELECT, por la misma razón que la 046
-- documenta: el `GRANT EXECUTE` a `authenticated` es imprescindible para que
-- PostgREST enrute la llamada, así que ese `IF` es lo único que separa a
-- cualquier cuenta con sesión de un volcado completo de cuentas/PII vía
-- `supabase.rpc()` directo, salteándose el `requireAdmin()` de la página.
-- Sumar una columna no puede aflojar esa condición.
-- ============================================================================

DROP FUNCTION IF EXISTS admin_user_directory();

CREATE FUNCTION admin_user_directory()
RETURNS TABLE (
  profile_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  role user_role,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  banned_until TIMESTAMPTZ,
  organizacion TEXT
) AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede leer el directorio de cuentas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.first_name, p.last_name, u.email::TEXT, p.role, p.phone, p.address,
    p.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
    COALESCE(vet_org.nombre, mun_org.name)
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  -- Cero o una fila por perfil, siempre: ver la nota del encabezado.
  LEFT JOIN LATERAL (
    SELECT vi.name AS nombre
    FROM vet_professionals vp
    JOIN vet_institutions vi ON vi.id = vp.institution_id
    WHERE vp.profile_id = p.id
    ORDER BY vp.created_at ASC, vp.id ASC
    LIMIT 1
  ) vet_org ON TRUE
  -- `UNIQUE (profile_id)` en municipality_staff hace innecesario el LATERAL acá.
  LEFT JOIN municipality_staff ms ON ms.profile_id = p.id
  LEFT JOIN municipalities mun_org ON mun_org.id = ms.municipality_id
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_user_directory() TO authenticated;

-- ============================================================================
-- ROLLBACK
--
-- No es un DROP: `admin_user_directory()` tiene que seguir existiendo, porque
-- `Usuarios` la usa desde la 046. Revertir esta migración significa volver a
-- crear la versión de la 046 —la de once columnas, sin `organizacion` y sin
-- los tres LEFT JOIN— tal cual está escrita en
-- `046_admin_team_and_audit.sql`, y volver a otorgar su GRANT. Igual que en
-- la 038: cuando lo que cambia es el cuerpo de una función, el rollback es
-- reponer el cuerpo viejo, no borrar la función.
--
-- El DROP también hace falta al revertir, por el mismo motivo que acá: sacar
-- la columna vuelve a cambiar el tipo de retorno.
-- ============================================================================
-- DROP FUNCTION IF EXISTS admin_user_directory();
-- (y a continuación, el CREATE FUNCTION admin_user_directory() de la 046,
--  seguido de GRANT EXECUTE ON FUNCTION admin_user_directory() TO authenticated;)
