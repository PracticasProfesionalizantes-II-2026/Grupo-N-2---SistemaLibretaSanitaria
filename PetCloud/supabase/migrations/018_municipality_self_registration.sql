-- ============================================================================
-- PetCloud — Migración 018: el municipio se registra solo
--
-- Cambia **un** elemento de la lista blanca de `handle_new_user`. La función se
-- vuelve a declarar entera porque Postgres no tiene ALTER de cuerpo parcial; es
-- lo mismo que hacen todas las migraciones con CREATE OR REPLACE de este repo.
--
-- Por qué esto no reabre el agujero que la lista blanca cerró:
--
-- 1. Es una lista de permitidos, no de prohibidos. El `ELSE` atrapa cualquier
--    string que no sea literalmente uno de los tres. 'admin' queda afuera por
--    construcción, y sumar un tercer elemento no debilita el ELSE en una sola
--    instrucción. Los roles privilegiados alcanzables pasan de cero a cero.
--
-- 2. El rol falsificado no compra nada. `municipalities.validated` arranca en
--    FALSE y todas las funciones del padrón, las estadísticas y las campañas
--    exigen `is_validated_municipality()`. Quien fuerce role: "municipality"
--    llega al mismo lugar que quien se registra de buena fe: un panel vacío con
--    un formulario de institución en blanco y cero filas de los datos de nadie.
--    'admin' no tiene ninguna compuerta equivalente, y por eso sigue afuera.
--
-- 3. Tampoco se llega por un segundo salto. `role_in_municipality` no se acepta
--    de los metadatos del alta: la ficha de personal la inserta
--    `signUpMunicipality()` con la service role. `validated` lo protege el
--    trigger `protect_municipality_validation()` de la 017. Y
--    `municipality_staff.municipality_id` no se puede mudar a otra jurisdicción
--    porque la política de UPDATE lo exige de los dos lados.
--
-- 4. El radio de daño termina en esta tupla. `protect_profile_role`,
--    `sync_role_to_auth` y las dos políticas de `profiles` son agnósticas del
--    rol: miran "¿cambió `role`?" y `auth.uid() = id`, nunca qué valor es.
--
-- Por qué esta migración va segunda, no última. `municipality_staff`, el
-- trigger `protect_municipality_validation()` y el default `validated = FALSE`
-- ya existen desde la 017 — este mismo paso —, así que no falta ninguna
-- restricción de base de datos el día que se puede crear la primera cuenta
-- municipal autorregistrada. Lo que sí faltaría, si esta migración se aplicara
-- sin más, es la compuerta del lado de la aplicación: por eso
-- `src/app/municipio/layout.tsx` lee `getMunicipalitySession()` y redirige a
-- `/cuenta-en-revision` mientras `municipio.validada` sea falso, y ese gate
-- entra en el mismo paso de trabajo que esta migración, no en una fase
-- posterior. Sin él, entre esta migración y la que armara las pantallas del
-- padrón, una cuenta municipal autorregistrada y sin validar entraría al panel
-- y se le serviría el padrón de mentira que hoy vive en
-- `src/features/municipality/data/census.ts` —catorce registros con nombre,
-- domicilio y teléfono de vecinos ficticios— porque las pantallas todavía no
-- leerían SQL y nada consultaría la columna `validated`. Cerrar esa ventana no
-- es cuestión de postergar esta migración: es cuestión de que la compuerta de
-- la aplicación llegue en el mismo paso que la habilita.
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested TEXT;
  resolved user_role;
BEGIN
  requested := NEW.raw_user_meta_data->>'role';

  resolved := CASE
    WHEN requested IN ('owner', 'vet', 'municipality') THEN requested::user_role
    ELSE 'owner'::user_role
  END;

  INSERT INTO profiles (id, role, first_name, last_name)
  VALUES (
    NEW.id,
    resolved,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );

  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', resolved)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ROLLBACK
-- Volver a declarar handle_new_user() con la tupla de dos roles de la 001
-- (WHEN requested IN ('owner', 'vet')), y revertir el comentario de la 001:53.
--
-- Las cuentas de municipio ya registradas conservan su rol —el trigger solo corre
-- en el INSERT de auth.users— pero siguen sin validar y por lo tanto no ven el
-- padrón de nadie. No hace falta borrarlas.
