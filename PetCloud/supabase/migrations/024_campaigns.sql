-- ============================================================================
-- PetCloud — Migración 024: campañas municipales
--
-- Hasta acá `/municipio/campanas` lee `municipalCampaigns` de
-- `features/municipality/content/campaigns.ts`. Esta migración le da domicilio
-- real: `campaigns`, sus puntos de aplicación (`campaign_locations`) y los
-- barrios que apunta (`campaign_neighborhoods`), más las dos funciones
-- auxiliares que el resto de la fase necesita para leerlas sin volver a unir
-- la tabla madre desde cada política hija.
--
-- Tres decisiones no obvias, explicadas una vez acá para no repetirlas en cada
-- columna:
--
-- 1) `inscriptos` y `aplicadas` del mock **no son columnas**. Son conteos que
--    salen de `vaccinations.campaign_id` (dosis con y sin `verified`, cuando
--    exista esa FK en la 026): guardarlos acá crearía una segunda fuente de
--    verdad que se desincroniza en cuanto una veterinaria firma una dosis. La
--    columna que sí queda es `target_doses` (`meta` del mock), porque es un
--    dato de entrada que carga el municipio, no algo que el sistema mide.
--
-- 2) `service_type` y `status` son `TEXT` con `CHECK`, no `ENUM` de Postgres.
--    Es la misma convención que ya separa `user_role`/`pet_species` (dominios
--    estables, ENUM) de `role_in_institution`/`role_in_municipality`
--    (listas que el producto todavía mueve, CHECK): la taxonomía de campañas
--    recién tiene tres valores observados en el mock y es la primera candidata
--    a crecer. Ensanchar un CHECK es un `ALTER TABLE ... DROP/ADD CONSTRAINT`;
--    ensanchar un ENUM value-by-value tiene más ceremonia y no se puede hacer
--    dentro de una transacción en versiones viejas de Postgres.
--
-- 3) La escritura es de `operator` y `admin`, nunca de `readonly` — igual que
--    la fila "campañas / ... / escritura" de la matriz de roles de la fase.
--    `readonly` es el rol de sólo consulta en todo el panel (lo mismo que ya
--    vale para el padrón); dejarlo escribir campañas rompería esa regla para
--    un solo objeto sin ningún motivo de producto que lo pida.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- campaigns
--
-- `vaccines`, `requirements`, `channels` como `TEXT[]`: mismo precedente que
-- `vaccine_presets.species[]` (008) — son listas cortas que se muestran tal
-- cual, nunca se filtran por elemento individual ni se unen con otra tabla.
--
-- `starts_on`/`ends_on` en vez de un solo `date`: el mock ya distingue
-- "desde"/"hasta" porque una campaña de castración dura semanas
-- (`raf2`: 2026-08-03 a 2026-12-18) mientras que un operativo de vacunación
-- suele ser un fin de semana. El `CHECK` evita cargar una campaña que termina
-- antes de empezar.
--
-- `is_free`/`open_to_non_residents` quedan como columnas simples: son flags de
-- exhibición (el mock los llama `gratuita`/`abiertaANoResidentes`), no reglas
-- que el motor tenga que hacer cumplir todavía.
-- ----------------------------------------------------------------------------
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  service_type TEXT NOT NULL
    CHECK (service_type IN ('antirrabica', 'castracion', 'mixta')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'finished', 'cancelled')),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  is_free BOOLEAN NOT NULL DEFAULT TRUE,
  open_to_non_residents BOOLEAN NOT NULL DEFAULT FALSE,
  vaccines TEXT[] NOT NULL DEFAULT '{}',
  requirements TEXT[] NOT NULL DEFAULT '{}',
  channels TEXT[] NOT NULL DEFAULT '{}',
  -- Meta de dosis a aplicar. Lo que sí se aplicó se cuenta, no se guarda acá
  -- (ver nota 1 del encabezado).
  target_doses INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX idx_campaigns_municipality_status
  ON campaigns(municipality_id, status);

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- campaign_locations
--
-- `days`/`hours` quedan en texto libre ("Sábado 23 y domingo 24", "09:00 a
-- 16:00"), igual que el mock: inventarles una gramática de horarios resuelve
-- un problema que ninguna pantalla de esta fase tiene. `sort_order` existe
-- porque la ficha de detalle los lista en el orden que carga el municipio, no
-- alfabético ni por fecha de creación.
-- ----------------------------------------------------------------------------
CREATE TABLE campaign_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  place_name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  days TEXT NOT NULL DEFAULT '',
  hours TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_locations_campaign
  ON campaign_locations(campaign_id, sort_order);

CREATE TRIGGER campaign_locations_updated_at
  BEFORE UPDATE ON campaign_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- campaign_neighborhoods
--
-- Join puro entre campaña y barrio (`barrios` del mock): sin columnas propias
-- ni `updated_at`, porque una fila de esta tabla no se edita, se inserta o se
-- borra. La clave primaria compuesta reemplaza tanto al `id` como al índice de
-- unicidad que haría falta si tuviera uno propio.
-- ----------------------------------------------------------------------------
CREATE TABLE campaign_neighborhoods (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  neighborhood_id UUID NOT NULL REFERENCES municipality_neighborhoods(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, neighborhood_id)
);

CREATE INDEX idx_campaign_neighborhoods_neighborhood
  ON campaign_neighborhoods(neighborhood_id);

-- ----------------------------------------------------------------------------
-- Funciones auxiliares para RLS
--
-- Mismo patrón que la 017/022: `SECURITY DEFINER` con `search_path` fijo, y
-- cada una lee una sola tabla. Existen para que `campaign_locations` y
-- `campaign_neighborhoods` no tengan que volver a unir `campaigns` desde su
-- propia política — la unen una vez acá, como el dueño de la tabla, y el
-- resultado se reutiliza en las tres tablas de esta migración.
--
-- Llamar una función `SECURITY DEFINER` desde una política de la misma tabla
-- que ella consulta no reabre la recursión de la 005: la función corre como el
-- dueño de `campaigns`, que está exento de la propia RLS de la tabla (ninguna
-- de las tres tablas de esta migración lleva `FORCE ROW LEVEL SECURITY`, por
-- el mismo motivo que la 017 y la 023 ya dejaron anotado).
-- ----------------------------------------------------------------------------

/** La jurisdicción dueña de una campaña, para las políticas de sus tablas hijas. */
CREATE OR REPLACE FUNCTION campaign_municipality_id(p_campaign_id UUID)
RETURNS UUID AS $$
  SELECT municipality_id FROM campaigns WHERE id = p_campaign_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

/**
 * ¿Es una campaña que cualquiera puede ver, dueño de mascota o visitante sin
 * sesión? Todo lo que no sea borrador ni cancelada. Un borrador es trabajo en
 * curso del municipio; una campaña cancelada ya no es información útil para
 * un vecino que decide si ir o no — las dos quedan puertas adentro.
 */
CREATE OR REPLACE FUNCTION campaign_is_public(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT status NOT IN ('draft', 'cancelled')
     FROM campaigns WHERE id = p_campaign_id),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE campaigns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_neighborhoods ENABLE ROW LEVEL SECURITY;

-- Nunca `FORCE ROW LEVEL SECURITY` en estas tres tablas — ver la nota de las
-- funciones auxiliares, arriba: es lo que les permite saltear su propia RLS.

-- ---------------------------------------------------------------- campaigns
--
-- Dos políticas de SELECT que se combinan con OR (mismo comentario que deja la
-- 008): el personal municipal ve **todas** las campañas de su jurisdicción,
-- incluidos los borradores — es su propio trabajo en curso. Cualquier otra
-- sesión, incluida la anónima, ve solamente las que `campaign_is_public()`
-- marca como públicas. Sin `TO authenticated`: el sitio público lista
-- operativos vigentes antes de que el vecino inicie sesión, igual que
-- `municipalities_select` (017) ya deja abierto el directorio de municipios.
CREATE POLICY "campaigns_select_staff" ON campaigns FOR SELECT
  USING (municipality_id = my_municipality_id());

CREATE POLICY "campaigns_select_public" ON campaigns FOR SELECT
  USING (campaign_is_public(id));

-- Alta/edición/baja: `operator` y `admin` de una jurisdicción validada, nunca
-- `readonly` (ver nota 3 del encabezado). `is_validated_municipality()` sigue
-- la misma regla que censo/estadísticas: una jurisdicción sin validar no
-- gestiona campañas todavía, aunque sí pueda seguir completando los datos de
-- su propia institución (esa es la 017, no ésta).
CREATE POLICY "campaigns_insert" ON campaigns FOR INSERT
  WITH CHECK (
    municipality_id = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

CREATE POLICY "campaigns_update" ON campaigns FOR UPDATE
  USING (
    municipality_id = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  )
  WITH CHECK (
    municipality_id = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

CREATE POLICY "campaigns_delete" ON campaigns FOR DELETE
  USING (
    municipality_id = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

-- --------------------------------------------------------- campaign_locations
--
-- Mismo esquema de dos SELECT que `campaigns`, pero resuelto vía
-- `campaign_municipality_id()`/`campaign_is_public()` en vez de repetir el
-- `JOIN` a mano: el personal ve los puntos de sus propias campañas (con
-- borrador incluido), cualquier otra sesión ve los de una campaña pública.
CREATE POLICY "campaign_locations_select_staff" ON campaign_locations FOR SELECT
  USING (campaign_municipality_id(campaign_id) = my_municipality_id());

CREATE POLICY "campaign_locations_select_public" ON campaign_locations FOR SELECT
  USING (campaign_is_public(campaign_id));

CREATE POLICY "campaign_locations_insert" ON campaign_locations FOR INSERT
  WITH CHECK (
    campaign_municipality_id(campaign_id) = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

CREATE POLICY "campaign_locations_update" ON campaign_locations FOR UPDATE
  USING (
    campaign_municipality_id(campaign_id) = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  )
  WITH CHECK (
    campaign_municipality_id(campaign_id) = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

CREATE POLICY "campaign_locations_delete" ON campaign_locations FOR DELETE
  USING (
    campaign_municipality_id(campaign_id) = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

-- ------------------------------------------------------- campaign_neighborhoods
--
-- Idéntica forma a `campaign_locations`: es la otra tabla hija de `campaigns`,
-- y la lectura pública existe para que el detalle de una campaña pública
-- muestre qué barrios cubre sin exponer nada de otra jurisdicción.
CREATE POLICY "campaign_neighborhoods_select_staff" ON campaign_neighborhoods FOR SELECT
  USING (campaign_municipality_id(campaign_id) = my_municipality_id());

CREATE POLICY "campaign_neighborhoods_select_public" ON campaign_neighborhoods FOR SELECT
  USING (campaign_is_public(campaign_id));

CREATE POLICY "campaign_neighborhoods_insert" ON campaign_neighborhoods FOR INSERT
  WITH CHECK (
    campaign_municipality_id(campaign_id) = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

-- Sin UPDATE: una fila de este join no tiene columnas propias que editar
-- (ver la nota de la tabla, arriba) — cambiar el barrio de una campaña es
-- borrar la fila vieja e insertar la nueva, nunca un UPDATE.
CREATE POLICY "campaign_neighborhoods_delete" ON campaign_neighborhoods FOR DELETE
  USING (
    campaign_municipality_id(campaign_id) = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

-- ROLLBACK
-- DROP TRIGGER IF EXISTS campaign_locations_updated_at ON campaign_locations;
-- DROP TRIGGER IF EXISTS campaigns_updated_at ON campaigns;
-- DROP FUNCTION IF EXISTS campaign_is_public(UUID);
-- DROP FUNCTION IF EXISTS campaign_municipality_id(UUID);
-- DROP TABLE IF EXISTS campaign_neighborhoods CASCADE;
-- DROP TABLE IF EXISTS campaign_locations CASCADE;
-- DROP TABLE IF EXISTS campaigns CASCADE;
--
-- Si la 026 (`vaccination_campaign_fk.sql`) ya corrió, revertirla primero: el
-- CASCADE de `campaigns` no se lleva puesto ninguna dosis (esa FK es
-- `ON DELETE SET NULL`, nunca CASCADE) pero conviene revertir en orden inverso
-- al de aplicación, no por integridad de datos sino por prolijidad de la
-- secuencia de migraciones.
