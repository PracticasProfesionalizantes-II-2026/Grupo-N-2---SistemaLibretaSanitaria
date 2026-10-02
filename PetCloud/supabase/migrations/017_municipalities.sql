-- ============================================================================
-- PetCloud — Migración 017: el municipio existe en la base
--
-- Hasta acá los municipios vivían en `features/municipality/data/municipalities.ts`
-- y `profiles.municipality_id` era un TEXT sin FK, con el comentario de la 006
-- diciendo que la tabla real llegaría "con su migración propia". Esta es.
--
-- Espeja `vet_institutions` + `vet_professionals`: una institución con su
-- `validated`, y las personas que trabajan en ella con su rol. Las dos
-- diferencias a propósito están anotadas en `municipality_staff`.
--
-- Ninguna tabla de esta migración toca datos de ningún dueño.
-- ============================================================================

CREATE TABLE municipalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Existe por una sola razón: llevar los valores de texto que hoy tiene
  -- `profiles.municipality_id` ("vte-lopez") hasta la fila nueva en la 019. Sin
  -- esto no hay forma determinista de mapear lo viejo a lo nuevo. Después queda
  -- sosteniendo las URL públicas, que tampoco conviene que sean UUID.
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  province TEXT NOT NULL DEFAULT '',
  tax_id TEXT,
  contact_email TEXT,
  phone TEXT,
  website TEXT,
  -- El partido se aproxima con un círculo. `src/lib/geo` ya hace la cuenta de
  -- distancia; instalar PostGIS para cuatro círculos no es proporcional, y la
  -- jurisdicción real de una mascota es la declarada, no la que dice el GPS.
  center_latitude NUMERIC(9,6),
  center_longitude NUMERIC(9,6),
  center_address TEXT NOT NULL DEFAULT '',
  radius_km NUMERIC(5,1) NOT NULL DEFAULT 10,
  -- Texto que se muestra ({vacuna, frecuencia, especies}). No se filtra ni se
  -- une con nada: una tabla no compraría nada acá.
  mandatory_vaccines JSONB NOT NULL DEFAULT '[]',
  ordinance_text TEXT NOT NULL DEFAULT '',
  -- Igual que `vet_institutions.validated`: lo pone el equipo de PetCloud a
  -- mano. Lo protege `protect_municipality_validation` (ver más abajo).
  validated BOOLEAN NOT NULL DEFAULT FALSE,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER municipalities_updated_at
  BEFORE UPDATE ON municipalities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Barrios
--
-- Tabla y no un arreglo JSONB porque los tres usos son uniones: las campañas
-- apuntan a barrios, las estadísticas agrupan por barrio, y el vecino declara el
-- suyo. El UNIQUE es por municipio y no global: "centro" se repite en todas las
-- jurisdicciones y no hay motivo para que se peleen por el nombre.
-- ----------------------------------------------------------------------------
CREATE TABLE municipality_neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  estimated_population INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, slug)
);

CREATE INDEX idx_neighborhoods_municipality
  ON municipality_neighborhoods(municipality_id);

CREATE TRIGGER municipality_neighborhoods_updated_at
  BEFORE UPDATE ON municipality_neighborhoods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Personal municipal
--
-- `UNIQUE (profile_id)` es a propósito **más estricto que `vet_professionals`**,
-- que no lo tiene y lo paga con el `LIMIT 1` documentado de
-- `my_vet_institution_id()`. Un empleado municipal trabaja para una jurisdicción:
-- ponerlo en el esquema saca la ambigüedad de raíz en vez de taparla en la
-- función auxiliar.
--
-- El default es `readonly` —el permiso más chico— y la cuenta fundadora se crea
-- como `admin` desde `signUpMunicipality()` con la service role, nunca desde el
-- formulario. `role_in_municipality` no se acepta de los metadatos del alta.
--
-- Sin columna `validated` acá: lo que se valida es la institución, igual que en
-- `vet_institutions`. No hay matrícula municipal que validar por persona.
-- ----------------------------------------------------------------------------
CREATE TABLE municipality_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  role_in_municipality TEXT NOT NULL DEFAULT 'readonly'
    CHECK (role_in_municipality IN ('admin', 'operator', 'readonly')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE INDEX idx_municipality_staff_municipality
  ON municipality_staff(municipality_id);

CREATE TRIGGER municipality_staff_updated_at
  BEFORE UPDATE ON municipality_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Funciones auxiliares para RLS
--
-- Todas `SECURITY DEFINER` con `search_path` fijo, y cada una lee **una sola
-- tabla**: es la misma regla que dejó la migración 005 para evitar que una
-- política de RLS termine consultando otra tabla cuya política la consulta de
-- vuelta. Correr como el dueño de la tabla (el owner de las funciones,
-- `postgres`) es lo que las deja saltear la propia RLS de `municipality_staff`
-- sin reabrir esa recursión — siempre que estas tablas nunca lleven
-- `FORCE ROW LEVEL SECURITY` (ver la nota en la sección de políticas, más abajo).
-- ----------------------------------------------------------------------------

/** ¿Es personal municipal activo? */
CREATE OR REPLACE FUNCTION is_municipality()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM municipality_staff
    WHERE profile_id = auth.uid() AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

/**
 * La jurisdicción de quien llama. Sin `LIMIT 1`: a diferencia de
 * `my_vet_institution_id()` (008), `municipality_staff` tiene
 * `UNIQUE (profile_id)`, así que no hay ambigüedad que resolver.
 */
CREATE OR REPLACE FUNCTION my_municipality_id()
RETURNS UUID AS $$
  SELECT municipality_id FROM municipality_staff
  WHERE profile_id = auth.uid() AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

/** El rol dentro del municipio: 'admin', 'operator' o 'readonly'. */
CREATE OR REPLACE FUNCTION my_municipality_role()
RETURNS TEXT AS $$
  SELECT role_in_municipality FROM municipality_staff
  WHERE profile_id = auth.uid() AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

/**
 * ¿El municipio de quien llama está validado? Compone `my_municipality_id()`
 * con una lectura de `municipalities`; las dos corren como el dueño de la
 * tabla, así que ninguna política se vuelve a evaluar y no hay recursión.
 */
CREATE OR REPLACE FUNCTION is_validated_municipality()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT validated FROM municipalities WHERE id = my_municipality_id()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- La validación del municipio no se la da el municipio
--
-- La política de UPDATE de `municipalities` deja que un admin complete los datos
-- de su propia jurisdicción —nombre, contacto, ordenanza, vacunas obligatorias—
-- y `validated` es una columna más de esa fila: sin esto, un
-- `update({ validated: true })` desde el navegador se auto-habilitaría el padrón
-- entero. RLS no puede comparar contra el valor anterior, así que lo hace un
-- trigger, igual que con `profiles.role`.
--
-- Se mira `current_user` y no las claims del JWT por la misma razón que en la
-- 001: PostgREST hace SET ROLE con el rol del token, así que el backoffice llega
-- como 'service_role' y el navegador como 'authenticated'. Leer las claims
-- fallaría desde el editor SQL del dashboard —donde no hay ninguna— y ahí una
-- validación legítima se revertiría en silencio, que es justo el caso que hoy
-- resuelve a mano el equipo de PetCloud.
--
-- Se revierte en silencio en vez de abortar: el mismo UPDATE suele traer cambios
-- legítimos (dirección, teléfono) y no hay motivo para tirarlos abajo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_municipality_validation()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.validated IS DISTINCT FROM OLD.validated
      OR NEW.validated_at IS DISTINCT FROM OLD.validated_at)
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
  THEN
    NEW.validated := OLD.validated;
    NEW.validated_at := OLD.validated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER municipalities_protect_validation
  BEFORE UPDATE ON municipalities
  FOR EACH ROW EXECUTE FUNCTION protect_municipality_validation();

-- ----------------------------------------------------------------------------
-- El municipio no se queda sin administrador
--
-- Solo un admin puede designar admins. Si el último se degrada a operador, se
-- suspende, o se borra, la cuenta queda viva y sin nadie que pueda gestionar
-- usuarios, zonas ni los datos de la institución: no hay backoffice que lo
-- desatasque, así que la única salida sería el editor SQL. Se corta antes.
--
-- Acá **se aborta** en vez de revertir en silencio, al revés que
-- `protect_profile_role` y `protect_municipality_validation`. En esos dos la
-- fila traía también cambios legítimos que valía la pena conservar; acá la
-- operación entera es el error, y un DELETE no se puede revertir a medias. Que
-- la pantalla diga "guardado" mientras la degradación no ocurrió sería peor que
-- el error.
--
-- SECURITY DEFINER porque el conteo tiene que ser el real: leído como
-- 'authenticated' pasaría por la política de SELECT de la tabla, y un recuento
-- filtrado que devuelva 0 de más bloquearía bajas legítimas —o, si algún día esa
-- política se afloja, dejaría pasar la que no. Lee una sola tabla, como pide la
-- regla de la 005.
--
-- La service role queda afuera por la misma razón que en la 001, y además por
-- una concreta: borrar la cuenta de auth cascadea `profiles` →
-- `municipality_staff`, y sin esta salida el trigger le impediría al equipo de
-- PetCloud dar de baja una cuenta municipal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_last_municipality_admin()
RETURNS TRIGGER AS $$
DECLARE
  fila municipality_staff;
  otros_admins INTEGER;
BEGIN
  fila := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN fila;
  END IF;

  -- Solo importa la fila que hoy es admin activo: las demás no sostienen nada.
  IF OLD.role_in_municipality <> 'admin' OR OLD.status <> 'active' THEN
    RETURN fila;
  END IF;

  -- Sigue siendo admin activo del mismo municipio: el cambio es de otra columna.
  IF TG_OP = 'UPDATE'
     AND NEW.role_in_municipality = 'admin'
     AND NEW.status = 'active'
     AND NEW.municipality_id = OLD.municipality_id
  THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO otros_admins
  FROM municipality_staff
  WHERE municipality_id = OLD.municipality_id
    AND role_in_municipality = 'admin'
    AND status = 'active'
    AND id <> OLD.id;

  IF otros_admins = 0 THEN
    RAISE EXCEPTION
      'El municipio quedaría sin ningún administrador activo. Designá otro antes de cambiar o dar de baja a este.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN fila;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER municipality_staff_protect_last_admin
  BEFORE UPDATE OR DELETE ON municipality_staff
  FOR EACH ROW EXECUTE FUNCTION protect_last_municipality_admin();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE municipalities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipality_neighborhoods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipality_staff          ENABLE ROW LEVEL SECURITY;

-- Nunca `FORCE ROW LEVEL SECURITY` en estas tablas. Las funciones auxiliares de
-- arriba funcionan porque el dueño de la tabla queda exento de sus propias
-- políticas; con FORCE, `my_municipality_id()` —que se llama desde la política de
-- la misma tabla que lee— vuelve a entrar en la política y aparece el 42P17 que
-- la 005 arregló.

-- Municipios: lectura abierta, por el mismo motivo que `vet_institutions`. El
-- vecino tiene que poder elegir su jurisdicción antes de pertenecer a ninguna, y
-- el sitio público lista los municipios adheridos.
CREATE POLICY "municipalities_select" ON municipalities FOR SELECT
  USING (true);

-- Sin chequeo de `validated`: completar los datos de la propia institución es
-- justamente lo que un municipio sin validar tiene que poder hacer. `validated`
-- queda afuera por el trigger, no por esta política.
CREATE POLICY "municipalities_update" ON municipalities FOR UPDATE
  USING (id = my_municipality_id() AND my_municipality_role() = 'admin')
  WITH CHECK (id = my_municipality_id() AND my_municipality_role() = 'admin');

-- Sin INSERT ni DELETE desde el navegador: los municipios los da de alta
-- `signUpMunicipality()` con la service role, y no se borran (fuera de alcance).

CREATE POLICY "neighborhoods_select" ON municipality_neighborhoods FOR SELECT
  USING (true);

CREATE POLICY "neighborhoods_insert" ON municipality_neighborhoods FOR INSERT
  WITH CHECK (municipality_id = my_municipality_id() AND my_municipality_role() = 'admin');

CREATE POLICY "neighborhoods_update" ON municipality_neighborhoods FOR UPDATE
  USING (municipality_id = my_municipality_id() AND my_municipality_role() = 'admin')
  WITH CHECK (municipality_id = my_municipality_id() AND my_municipality_role() = 'admin');

CREATE POLICY "neighborhoods_delete" ON municipality_neighborhoods FOR DELETE
  USING (municipality_id = my_municipality_id() AND my_municipality_role() = 'admin');

-- Personal: se ve el equipo propio y nada más. A diferencia de
-- `vet_professionals`, que es `USING (true)` para poder mostrar el equipo de una
-- veterinaria en público, acá no hay ninguna pantalla pública que liste
-- empleados municipales.
CREATE POLICY "municipality_staff_select" ON municipality_staff FOR SELECT
  USING (municipality_id = my_municipality_id());

CREATE POLICY "municipality_staff_insert" ON municipality_staff FOR INSERT
  WITH CHECK (municipality_id = my_municipality_id() AND my_municipality_role() = 'admin');

-- `municipality_id` se compara de los dos lados. Sin el WITH CHECK, un admin
-- podría mudar su propia ficha —o la de un compañero— a otra jurisdicción y
-- entrar a leer un padrón que no es suyo.
CREATE POLICY "municipality_staff_update" ON municipality_staff FOR UPDATE
  USING (municipality_id = my_municipality_id() AND my_municipality_role() = 'admin')
  WITH CHECK (municipality_id = my_municipality_id() AND my_municipality_role() = 'admin');

CREATE POLICY "municipality_staff_delete" ON municipality_staff FOR DELETE
  USING (municipality_id = my_municipality_id() AND my_municipality_role() = 'admin');

-- ----------------------------------------------------------------------------
-- Siembra: los cuatro municipios adheridos hoy
--
-- Migran uno a uno los datos que hasta ahora vivían en
-- `src/features/municipality/data/municipalities.ts`. El `slug` es el mismo
-- valor que ya escribe `updateMunicipality` en `profiles.municipality_id`
-- (todavía TEXT en esta migración): es lo que permite que la 019 traduzca cada
-- fila existente a la fila nueva sin adivinar.
--
-- Las cuatro se siembran con `validated = true`: el mock ya las marcaba
-- `adherido: true`, es decir que son jurisdicciones con las que PetCloud ya
-- opera hoy, no altas pendientes de revisión. Ninguna tiene todavía una fila en
-- `municipality_staff` — el panel que existía hasta ahora era una sola cuenta de
-- demostración, sin sesión real por jurisdicción. `signUpMunicipality()` (018 en
-- adelante) siempre crea una jurisdicción nueva; vincular una cuenta que se
-- autorregistra con una de estas cuatro filas —para no duplicar un municipio que
-- ya está operando— es una decisión operativa del equipo de PetCloud, a mano,
-- fuera del alcance de esta migración.
--
-- Cada entrada de `mandatory_vaccines` suma dos campos que el mock no tenía:
-- `es_obligatoria_antirrabica` marca cuál de las vacunas del municipio es la
-- antirrábica, y `alias_patrones` guarda las formas en que una veterinaria puede
-- haber escrito su nombre ("Antirrábica", "Antirrabica", "Rabia"). Son la base
-- para que el padrón calcule el estado antirrábico por catálogo en vez de
-- adivinarlo con un patrón de texto libre sobre lo que cargó la veterinaria — es
-- el único número que el padrón promete que sea exacto.
-- ----------------------------------------------------------------------------
INSERT INTO municipalities (
  slug, name, short_name, province, tax_id, contact_email, phone, website,
  center_latitude, center_longitude, center_address, radius_km,
  mandatory_vaccines, ordinance_text, validated, validated_at
) VALUES
(
  'vte-lopez', 'Municipio de Vicente López', 'Vicente López', 'Buenos Aires',
  '30-99900011-2', 'zoonosis@vicentelopez.gob.ar', '+54 11 4513-9800',
  'www.vicentelopez.gob.ar/zoonosis',
  -34.5265, -58.4790, 'Av. Maipú 2609, Vicente López', 7,
  '[
    {"vacuna": "Antirrábica", "frecuencia": "Anual desde los 3 meses", "especies": "Perros y gatos", "es_obligatoria_antirrabica": true, "alias_patrones": ["Antirrábica", "Antirrabica", "Rabia"]},
    {"vacuna": "Quíntuple", "frecuencia": "Anual", "especies": "Perros", "es_obligatoria_antirrabica": false, "alias_patrones": []},
    {"vacuna": "Triple felina", "frecuencia": "Anual", "especies": "Gatos", "es_obligatoria_antirrabica": false, "alias_patrones": []}
  ]'::jsonb,
  'Ordenanza 12.480/24 — Registro Único de Animales de Compañía. Obliga a inscribir toda mascota del partido y a mantener la antirrábica vigente. La inscripción y la vacunación en operativos municipales son gratuitas.',
  true, now()
),
(
  'san-isidro', 'Municipio de San Isidro', 'San Isidro', 'Buenos Aires',
  '30-99900044-8', 'zoonosis@sanisidro.gob.ar', '+54 11 4512-3200',
  'www.sanisidro.gob.ar/zoonosis',
  -34.4708, -58.5126, 'Av. Centenario 77, San Isidro', 8,
  '[
    {"vacuna": "Antirrábica", "frecuencia": "Anual desde los 4 meses", "especies": "Perros y gatos", "es_obligatoria_antirrabica": true, "alias_patrones": ["Antirrábica", "Antirrabica", "Rabia"]},
    {"vacuna": "Quíntuple", "frecuencia": "Anual", "especies": "Perros", "es_obligatoria_antirrabica": false, "alias_patrones": []}
  ]'::jsonb,
  'Ordenanza 9.112/23 — Registro municipal de animales de compañía y castración gratuita. La antirrábica es obligatoria desde los 4 meses.',
  true, now()
),
(
  'rafaela', 'Municipalidad de Rafaela', 'Rafaela', 'Santa Fe',
  '30-99901188-5', 'zoonosis@rafaela.gob.ar', '+54 3492 50-4500',
  'www.rafaela.gob.ar/zoonosis',
  -31.2521, -61.4867, 'Moreno 8, Rafaela, Santa Fe', 10,
  '[
    {"vacuna": "Antirrábica", "frecuencia": "Anual desde los 3 meses", "especies": "Perros y gatos", "es_obligatoria_antirrabica": true, "alias_patrones": ["Antirrábica", "Antirrabica", "Rabia"]},
    {"vacuna": "Quíntuple", "frecuencia": "Anual", "especies": "Perros", "es_obligatoria_antirrabica": false, "alias_patrones": []},
    {"vacuna": "Tos de las perreras (bordetella)", "frecuencia": "Anual", "especies": "Perros que asisten a guarderías", "es_obligatoria_antirrabica": false, "alias_patrones": []}
  ]'::jsonb,
  'Ordenanza 5.204/25 — Tenencia responsable. Inscripción obligatoria en el registro municipal y castración gratuita en el Centro de Zoonosis con turno previo.',
  true, now()
),
(
  'sunchales', 'Municipalidad de Sunchales', 'Sunchales', 'Santa Fe',
  '30-99902277-1', 'bromatologia@sunchales.gob.ar', '+54 3493 42-0300',
  'www.sunchales.gob.ar',
  -30.9463, -61.5586, 'Av. Independencia 400, Sunchales, Santa Fe', 6,
  '[
    {"vacuna": "Antirrábica", "frecuencia": "Anual desde los 3 meses", "especies": "Perros y gatos", "es_obligatoria_antirrabica": true, "alias_patrones": ["Antirrábica", "Antirrabica", "Rabia"]}
  ]'::jsonb,
  'Ordenanza 2.845/24 — Registro de mascotas y vacunación antirrábica gratuita en los operativos barriales.',
  true, now()
);

INSERT INTO municipality_neighborhoods (municipality_id, slug, name, estimated_population)
SELECT m.id, b.slug, b.name, b.population
FROM municipalities m
JOIN (VALUES
  ('vte-lopez', 'olivos', 'Olivos', 4200),
  ('vte-lopez', 'florida', 'Florida', 3800),
  ('vte-lopez', 'munro', 'Munro', 3400),
  ('vte-lopez', 'vte-lopez-centro', 'Vicente López', 3100),
  ('vte-lopez', 'carapachay', 'Carapachay', 2600),
  ('vte-lopez', 'villa-martelli', 'Villa Martelli', 2400),
  ('vte-lopez', 'la-lucila', 'La Lucila', 1900),
  ('vte-lopez', 'florida-oeste', 'Florida Oeste', 1700),
  ('san-isidro', 'si-centro', 'San Isidro Centro', 3600),
  ('san-isidro', 'martinez', 'Martínez', 3400),
  ('san-isidro', 'acassuso', 'Acassuso', 2200),
  ('san-isidro', 'beccar', 'Beccar', 2900),
  ('san-isidro', 'boulogne', 'Boulogne', 2100),
  ('san-isidro', 'villa-adelina', 'Villa Adelina', 1800),
  ('rafaela', 'raf-centro', 'Centro', 2400),
  ('rafaela', 'raf-barranquitas', 'Barranquitas', 1900),
  ('rafaela', 'raf-villa-rosas', 'Villa Rosas', 1600),
  ('rafaela', 'raf-monsenor', 'Monseñor Zaspe', 1300),
  ('rafaela', 'raf-2-de-abril', '2 de Abril', 1100),
  ('rafaela', 'raf-italia', 'Italia', 980),
  ('sunchales', 'sun-centro', 'Centro', 1400),
  ('sunchales', 'sun-moreno', 'Barrio Moreno', 900),
  ('sunchales', 'sun-belgrano', 'Barrio Belgrano', 780),
  ('sunchales', 'sun-villa-ferrocarril', 'Villa Ferrocarril', 640)
) AS b(municipality_slug, slug, name, population)
  ON b.municipality_slug = m.slug;

-- ROLLBACK
-- DROP TRIGGER IF EXISTS municipality_staff_protect_last_admin ON municipality_staff;
-- DROP TRIGGER IF EXISTS municipalities_protect_validation ON municipalities;
-- DROP FUNCTION IF EXISTS protect_last_municipality_admin();
-- DROP FUNCTION IF EXISTS protect_municipality_validation();
-- DROP FUNCTION IF EXISTS is_validated_municipality();
-- DROP FUNCTION IF EXISTS my_municipality_role();
-- DROP FUNCTION IF EXISTS my_municipality_id();
-- DROP FUNCTION IF EXISTS is_municipality();
-- DROP TABLE IF EXISTS municipality_staff CASCADE;
-- DROP TABLE IF EXISTS municipality_neighborhoods CASCADE;
-- DROP TABLE IF EXISTS municipalities CASCADE;
--
-- Adición pura: no se pierde ningún dato preexistente. Si la 019 ya corrió, hay
-- que revertirla primero — el CASCADE se llevaría puesto profiles.municipality_id.
