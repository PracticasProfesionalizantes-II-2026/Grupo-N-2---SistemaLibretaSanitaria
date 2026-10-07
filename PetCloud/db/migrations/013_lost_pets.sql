-- 013 · Mascota perdida: avistamientos y punto de partida de la búsqueda
--
-- `pets.lost_status`, `lost_at` y `lost_radius_km` ya existen desde la 002. Lo
-- que falta es dónde se la vio, que son dos cosas distintas:
--
--   · dónde la vio por última vez el dueño  → arranca la búsqueda
--   · dónde la vio alguien más después      → la mueve
--
-- ----------------------------------------------------------------------------
-- 1 · Dónde empezó la búsqueda
--
-- El feed de /alertas necesita una posición por mascota perdida. Si la única
-- fuente fueran los avistamientos, una mascota recién reportada no aparecería
-- en el feed hasta que un desconocido la viera — justo al revés de lo que hace
-- falta, porque las primeras horas son las que más importan.
--
-- Por eso el reporte guarda su propio punto. No es un avistamiento: nadie la vio
-- ahí ahora, es de donde se fue.
-- ----------------------------------------------------------------------------

ALTER TABLE pets ADD COLUMN IF NOT EXISTS lost_latitude NUMERIC(9,6);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS lost_longitude NUMERIC(9,6);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS lost_address TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS lost_notes TEXT;

COMMENT ON COLUMN pets.lost_latitude IS
  'Dónde la vio por última vez el dueño. Es el centro del radio de alerta, no un avistamiento.';

-- El feed recorre las que están perdidas, que siempre van a ser pocas frente al
-- total. Sin esto la consulta lee la tabla entera de mascotas.
CREATE INDEX IF NOT EXISTS idx_pets_lost_status ON pets(lost_status)
  WHERE lost_status = 'lost';

-- ----------------------------------------------------------------------------
-- 2 · Avistamientos
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE sighting_source AS ENUM ('app', 'qr_scan');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lost_pet_sightings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  -- Se borra la cuenta de quien reportó, el avistamiento queda: es información
  -- de la búsqueda, no de esa persona. Mismo criterio que la 007.
  reported_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Quien escanea el collar sin cuenta deja su nombre y su teléfono acá.
  reporter_name TEXT,
  reporter_phone TEXT,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  address_text TEXT,
  notes TEXT,
  source sighting_source NOT NULL DEFAULT 'app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sightings_pet ON lost_pet_sightings(pet_id);
CREATE INDEX IF NOT EXISTS idx_sightings_created ON lost_pet_sightings(created_at DESC);

DROP TRIGGER IF EXISTS sightings_updated_at ON lost_pet_sightings;
CREATE TRIGGER sightings_updated_at
  BEFORE UPDATE ON lost_pet_sightings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Coordenadas dentro del planeta. La validación de verdad está en el Server
-- Action —donde se puede explicar el error— pero el camino anónimo no pasa por
-- RLS, así que la última palabra la tiene la tabla.
ALTER TABLE lost_pet_sightings DROP CONSTRAINT IF EXISTS sightings_coords_validas;
ALTER TABLE lost_pet_sightings ADD CONSTRAINT sightings_coords_validas
  CHECK (
    latitude BETWEEN -90 AND 90
    AND longitude BETWEEN -180 AND 180
    AND char_length(COALESCE(reporter_name, '')) <= 120
    AND char_length(COALESCE(reporter_phone, '')) <= 40
    AND char_length(COALESCE(address_text, '')) <= 300
    AND char_length(COALESCE(notes, '')) <= 1000
  );

ALTER TABLE lost_pet_sightings ENABLE ROW LEVEL SECURITY;

-- Los avistamientos de mi mascota.
--
-- `is_pet_owner()` en vez de un EXISTS contra `pets`: una política que consulta
-- otra tabla con RLS es la forma en que apareció el 42P17 de la 005. La función
-- es SECURITY DEFINER y toca una sola tabla, que es la regla que quedó.
DROP POLICY IF EXISTS "sightings_select_owner" ON lost_pet_sightings;
CREATE POLICY "sightings_select_owner" ON lost_pet_sightings FOR SELECT
  USING (is_pet_owner(pet_id));

-- Avisar con la cuenta propia. No hace falta tener nada que ver con la mascota:
-- justamente, quien la encuentra es alguien de afuera. Lo único que se exige es
-- que no pueda firmar el aviso con el nombre de otro.
DROP POLICY IF EXISTS "sightings_insert_authenticated" ON lost_pet_sightings;
CREATE POLICY "sightings_insert_authenticated" ON lost_pet_sightings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND reported_by_id = auth.uid());

-- Sin UPDATE ni DELETE a propósito: un avistamiento es lo que alguien dijo que
-- vio a una hora. Editarlo después le sacaría el único valor que tiene.

-- ----------------------------------------------------------------------------
-- 3 · Lo que esta migración NO hace
--
-- No agrega ninguna política de SELECT pública sobre `pets`.
--
-- La ficha del collar tiene que mostrar unos campos y esconder otros según
-- `lost_status` —el teléfono solo si está perdida, la historia clínica nunca—.
-- Eso, escrito como política de RLS, sería un CASE adentro de un USING: difícil
-- de leer, más difícil de auditar, y un error ahí abre la tabla entera.
--
-- Se resuelve en el servidor, en `getPublicPetByQr()`, que usa el cliente admin
-- y arma a mano el objeto que se devuelve. La lista de campos permitidos está en
-- un solo lugar y se lee de arriba abajo. Cambiar este criterio se avisa aparte.
-- ----------------------------------------------------------------------------
