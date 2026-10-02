-- ============================================================================
-- PetCloud — Migración 049: el perfil también se completa cuando el alta viene
-- de un proveedor externo (Google, Facebook, Apple)
--
-- `handle_new_user()` leía tres claves de `raw_user_meta_data`: `role`,
-- `first_name` y `last_name`. Esas claves las escribe NUESTRO formulario de
-- registro (`register-actions.ts` las manda en `options.data`), y ningún
-- proveedor OAuth las manda.
--
-- Google guarda `full_name`, `name`, `given_name`, `family_name`, `picture` y
-- `avatar_url`. Facebook guarda `full_name`, `name` y `picture`. Apple, cuando
-- manda algo, manda `full_name`.
--
-- Con lo anterior, `COALESCE(… ->> 'first_name', '')` resolvía a la cadena
-- vacía y el alta social terminaba creando un perfil sin nombre, sin apellido y
-- sin foto — teniendo los tres datos delante. El INSERT nunca falló (las tres
-- columnas son `NOT NULL DEFAULT ''` o nullables), así que no había error en
-- ningún log: simplemente aparecía una cuenta anónima.
--
-- Esta migración solo cambia CÓMO se completan esos campos. No toca la
-- resolución del rol: un alta por proveedor externo sigue naciendo `owner`,
-- que es la lista blanca de 018 y la única decisión segura cuando nadie eligió
-- rol — `protect_profile_role()` (001) sigue siendo quien impide escalarlo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Nombre y apellido a partir de lo que haya mandado el proveedor
--
-- El orden importa y va de lo más específico a lo más genérico:
--
--   1. `first_name` / `last_name` — nuestro propio formulario. Si están, mandan.
--   2. `given_name` / `family_name` — Google los manda ya separados, que es
--      mejor que cualquier corte que podamos hacer nosotros.
--   3. `full_name` / `name` — un solo campo. Se parte por el primer espacio:
--      la primera palabra es el nombre y **todo el resto** el apellido, porque
--      en castellano los dos apellidos son lo normal y cortar por el último
--      espacio dejaría la mitad del apellido en el nombre.
--
-- Devuelve cadena vacía y nunca NULL: `profiles.first_name` y `last_name` son
-- `NOT NULL DEFAULT ''`, y el resto del código ya trata `''` como "sin dato".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION split_provider_name(meta JSONB)
RETURNS TABLE (first_name TEXT, last_name TEXT) AS $$
DECLARE
  full_name TEXT;
  trimmed   TEXT;
BEGIN
  first_name := NULLIF(TRIM(COALESCE(meta ->> 'first_name', '')), '');
  last_name  := NULLIF(TRIM(COALESCE(meta ->> 'last_name', '')), '');

  IF first_name IS NULL THEN
    first_name := NULLIF(TRIM(COALESCE(meta ->> 'given_name', '')), '');
  END IF;

  IF last_name IS NULL THEN
    last_name := NULLIF(TRIM(COALESCE(meta ->> 'family_name', '')), '');
  END IF;

  -- Solo se parte el nombre completo si todavía falta alguno de los dos: quien
  -- ya mandó las partes por separado no debe verlas pisadas por un corte.
  IF first_name IS NULL OR last_name IS NULL THEN
    full_name := COALESCE(meta ->> 'full_name', meta ->> 'name', '');
    trimmed := TRIM(REGEXP_REPLACE(full_name, '\s+', ' ', 'g'));

    IF trimmed <> '' THEN
      IF first_name IS NULL THEN
        first_name := SPLIT_PART(trimmed, ' ', 1);
      END IF;

      IF last_name IS NULL AND POSITION(' ' IN trimmed) > 0 THEN
        last_name := SUBSTRING(trimmed FROM POSITION(' ' IN trimmed) + 1);
      END IF;
    END IF;
  END IF;

  first_name := COALESCE(first_name, '');
  last_name  := COALESCE(last_name, '');

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

COMMENT ON FUNCTION split_provider_name(JSONB) IS
  'Nombre y apellido a partir de las claves que manda cada proveedor de identidad. Ver migración 049.';

-- ----------------------------------------------------------------------------
-- El trigger de alta, ahora también para identidades externas
--
-- Cambios respecto de la versión de 018:
--   - nombre y apellido salen de `split_provider_name()`;
--   - `avatar_url` se completa con la foto del proveedor (`avatar_url` o
--     `picture`, según cuál mande);
--   - `ON CONFLICT (id) DO NOTHING` para que el trigger sea idempotente. No
--     debería dispararse dos veces para el mismo id, pero si alguna vez pasa
--     (una recreación del usuario, una restauración) la excepción abortaría el
--     INSERT en `auth.users` entero y el alta fallaría con un error que no
--     nombra a `profiles` por ningún lado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested TEXT;
  resolved  user_role;
  nombre    TEXT;
  apellido  TEXT;
  foto      TEXT;
BEGIN
  requested := NEW.raw_user_meta_data ->> 'role';

  resolved := CASE
    WHEN requested IN ('owner', 'vet', 'municipality') THEN requested::user_role
    ELSE 'owner'::user_role
  END;

  SELECT s.first_name, s.last_name
    INTO nombre, apellido
    FROM split_provider_name(COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)) AS s;

  foto := NULLIF(
    TRIM(COALESCE(
      NEW.raw_user_meta_data ->> 'avatar_url',
      NEW.raw_user_meta_data ->> 'picture',
      ''
    )),
    ''
  );

  INSERT INTO profiles (id, role, first_name, last_name, avatar_url)
  VALUES (NEW.id, resolved, nombre, apellido, foto)
  ON CONFLICT (id) DO NOTHING;

  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', resolved)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION handle_new_user() IS
  'Crea el perfil al darse de alta una cuenta, venga del formulario propio o de un proveedor externo. Ver migración 049.';
