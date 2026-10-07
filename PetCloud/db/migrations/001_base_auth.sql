-- ============================================================================
-- PetCloud — Migración 001: base + autenticación
--
-- Crea lo mínimo para que exista una cuenta real: el perfil que extiende
-- auth.users, la institución veterinaria y el profesional con su matrícula.
-- Las mascotas, el historial y el padrón llegan en migraciones posteriores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Roles
--
-- El enum vive en inglés porque es vocabulario de base de datos; la aplicación
-- los nombra en castellano (dueno / veterinario / municipio / admin) y traduce
-- en un solo lugar: src/config/roles.ts.
-- ----------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('owner', 'vet', 'municipality', 'admin');

-- ----------------------------------------------------------------------------
-- Perfiles
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'owner',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON profiles(role);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Alta automática del perfil al registrarse
--
-- El rol pedido viaja en raw_user_meta_data, que **lo escribe el cliente**: si
-- se copiara tal cual, cualquiera podría registrarse con role = 'admin'. Por eso
-- solo se aceptan los roles que la aplicación deja elegir en el registro. El
-- administrador lo crea el equipo de PetCloud, que es lo que la pantalla de
-- registro ya le dice a la persona.
--
-- La migración 018 sumó 'municipality' a esa lista: una cuenta de municipio se
-- registra sola pero nace sin validar, y sin validar no ve el padrón de nadie.
--
-- El rol se copia además a raw_app_meta_data, que el usuario no puede escribir y
-- que viaja dentro del JWT: así `proxy.ts` decide a qué panel puede entrar sin
-- consultar la base en cada request.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested TEXT;
  resolved user_role;
BEGIN
  requested := NEW.raw_user_meta_data->>'role';

  resolved := CASE
    WHEN requested IN ('owner', 'vet') THEN requested::user_role
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ----------------------------------------------------------------------------
-- El rol solo lo cambia el backoffice
--
-- La política de UPDATE de profiles deja que cada persona edite su propia fila
-- —nombre, teléfono, dirección—, y `role` es una columna más de esa fila: sin
-- esto, un `update({ role: 'admin' })` desde el navegador funcionaría. RLS no
-- puede comparar contra el valor anterior, así que lo hace un trigger: salvo que
-- la conexión use la service role (el backoffice), el rol vuelve al que estaba.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Se mira `current_user`, no las claims del JWT: PostgREST hace SET ROLE con
  -- el rol del token, así que una petición con la clave de service role llega
  -- como 'service_role' y una del navegador como 'authenticated'. Leer las
  -- claims fallaría desde el editor SQL del dashboard, donde no hay ninguna, y
  -- ahí un cambio de rol legítimo se revertiría en silencio.
  IF NEW.role IS DISTINCT FROM OLD.role
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
  THEN
    NEW.role := OLD.role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_protect_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role();

-- Si el backoffice cambia el rol, el JWT tiene que enterarse.
CREATE OR REPLACE FUNCTION sync_role_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER profiles_sync_role
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_role_to_auth();

-- ----------------------------------------------------------------------------
-- Instituciones veterinarias
-- ----------------------------------------------------------------------------
CREATE TABLE vet_institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  schedule JSONB NOT NULL DEFAULT '{}',
  validated BOOLEAN NOT NULL DEFAULT FALSE,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER vet_institutions_updated_at
  BEFORE UPDATE ON vet_institutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Profesionales veterinarios
--
-- La matrícula es única en todo el sistema: es el número que el colegio
-- profesional le dio a una persona, y es lo que le da valor sanitario a una
-- firma. Dos cuentas con la misma matrícula harían imposible saber quién firmó.
-- ----------------------------------------------------------------------------
CREATE TABLE vet_professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  license_number TEXT NOT NULL,
  license_validated BOOLEAN NOT NULL DEFAULT FALSE,
  specialty TEXT,
  signature_url TEXT,
  role_in_institution TEXT NOT NULL DEFAULT 'professional'
    CHECK (role_in_institution IN ('owner', 'professional', 'assistant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (license_number)
);

CREATE INDEX idx_vet_professionals_profile ON vet_professionals(profile_id);
CREATE INDEX idx_vet_professionals_institution ON vet_professionals(institution_id);

CREATE TRIGGER vet_professionals_updated_at
  BEFORE UPDATE ON vet_professionals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_professionals ENABLE ROW LEVEL SECURITY;

-- Perfiles: cada quien lee y edita el suyo. El rol queda protegido por el
-- trigger de arriba, no por esta política.
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Pendiente: que un veterinario lea el perfil del dueño de sus pacientes
-- (migración 003) y que el backoffice lea todos (migración 006).

-- Instituciones: lectura abierta, porque el dueño tiene que poder encontrar una
-- veterinaria antes de tener cualquier relación con ella.
CREATE POLICY "Anyone can read vet institutions"
  ON vet_institutions FOR SELECT
  USING (true);

CREATE POLICY "Vet owners can update own institution"
  ON vet_institutions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vet_professionals
      WHERE institution_id = vet_institutions.id
        AND profile_id = auth.uid()
        AND role_in_institution = 'owner'
    )
  );

CREATE POLICY "Authenticated users can create vet institutions"
  ON vet_institutions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Profesionales: lectura abierta para mostrar el equipo de una veterinaria.
CREATE POLICY "Anyone can read vet professionals"
  ON vet_professionals FOR SELECT
  USING (true);

CREATE POLICY "Users can create own vet professional record"
  ON vet_professionals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Vet professionals can update own record"
  ON vet_professionals FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- El titular puede dar de baja a alguien de su equipo (el botón de Institución).
-- Nadie más borra profesionales: la historia clínica que firmaron no se toca.
--
-- La subconsulta lee la misma tabla, lo que es seguro porque la política de
-- SELECT de arriba es `USING (true)` y no se vuelve a evaluar esta. Si algún día
-- se restringe esa lectura, hay que revisar esto: RLS que se consulta a sí misma
-- es la forma clásica de terminar en recursión infinita.
CREATE POLICY "Vet owners can remove team members"
  ON vet_professionals FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM vet_professionals AS owner_record
      WHERE owner_record.institution_id = vet_professionals.institution_id
        AND owner_record.profile_id = auth.uid()
        AND owner_record.role_in_institution = 'owner'
    )
    AND role_in_institution <> 'owner'
  );
