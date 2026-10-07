-- ============================================================================
-- PetCloud ERP — Migración 103: permisos de `service_role` sobre el schema erp
--
-- La 100 le dio a `service_role` USAGE sobre el schema, que permite *entrar*
-- pero no tocar ninguna tabla. La 101 concedió privilegios de tabla solo a
-- `authenticated`. Resultado: toda operación administrativa contra el ERP
-- fallaba con 42501 "permission denied for table products".
--
-- En `public` esto no se nota porque el shim de compatibilidad le concede a `service_role`
-- privilegios sobre las tablas nuevas por su cuenta. En un schema propio ese
-- automatismo no existe, y el hueco solo aparece cuando algo intenta escribir
-- sin sesión de usuario: un seed, un script de mantenimiento, un webhook, o
-- —como pasó acá— el andamiaje de las pruebas de RLS, que arma el escenario
-- con service role a propósito.
--
-- QUÉ SIGNIFICA Y QUÉ NO. `service_role` saltea RLS por diseño: es la llave
-- maestra del servidor y nunca viaja al navegador (`lib/db/index.ts`).
-- Darle acceso al schema `erp` no relaja ni una política: las de la 101 y el
-- trigger de la 102 siguen gobernando todo lo que pasa por `authenticated`,
-- que es por donde entra la aplicación.
--
-- `anon` sigue sin recibir nada. El ERP no tiene una sola pantalla pública.
-- ============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA erp TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA erp TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA erp TO service_role;

-- `GRANT ... ON ALL TABLES` alcanza a las que existen HOY. Sin esto, la
-- primera tabla del módulo de Ventas nacería con el mismo problema y alguien
-- perdería otra tarde averiguando por qué el seed no escribe.
--
-- Vale solo para los objetos que cree el rol que corre las migraciones, que es
-- exactamente por donde nacen todas las tablas de este schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA erp
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA erp
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA erp
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- A `authenticated` NO se le ponen privilegios por defecto, y es deliberado:
-- que una tabla nueva del ERP no quede expuesta a los usuarios solo por
-- haberse creado. Cada una tiene que conceder sus permisos y habilitar su RLS
-- a mano, como manda la plantilla de la 100.
