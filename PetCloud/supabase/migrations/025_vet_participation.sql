-- ============================================================================
-- PetCloud — Migración 025: participación de veterinarias
--
-- Hasta acá `/municipio/veterinarias` lee `adheredClinics` de
-- `features/municipality/content/campaigns.ts`, y el modo campaña de la
-- veterinaria lee `MunicipalCampaign.veterinarias` del mismo mock. Esta
-- migración les da domicilio real, en dos tablas separadas porque son dos
-- relaciones distintas del negocio, no una:
--
-- 1) `municipality_participating_vets` — el **registro de adhesión**: si una
--    veterinaria trabaja o no con un municipio, en general, más allá de
--    cualquier operativo puntual. Es lo que gestiona `/municipio/veterinarias`.
-- 2) `campaign_participating_vets` — cuáles de las veterinarias YA adheridas
--    quedan afectadas a UN operativo puntual.
--
-- Juntarlas en una sola tabla obligaría a re-invitar a una veterinaria cada
-- vez que arranca una campaña nueva, cuando la adhesión ya está resuelta desde
-- la campaña anterior. Con dos tablas, la primera vive mientras dura la
-- relación entre el municipio y la veterinaria; la segunda es efímera, una
-- fila por campaña por veterinaria.
--
-- Ninguna función ni política de esta migración se redeclara: reutiliza
-- `is_validated_municipality()` / `my_municipality_id()` / `my_municipality_role()`
-- de la 017, `is_institution_owner()` de la 005, y `campaign_municipality_id()`
-- de la 024.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- municipality_participating_vets — el registro de adhesión
--
-- `status` con cuatro valores y no dos columnas booleanas ("aceptada",
-- "suspendida"): un booleano permitiría combinaciones sin sentido como
-- "rechazada Y suspendida" al mismo tiempo. Los cuatro valores son mutuamente
-- excluyentes por diseño — la pantalla de veterinarias ya renderiza un solo
-- chip de estado por fila — así que un solo CHECK los expresa sin dejar
-- huecos para un estado imposible.
--
-- `invited_at` se llena solo (DEFAULT now()) porque toda fila nace invitada:
-- no existe un camino de alta que no sea una invitación (ver política de
-- INSERT, más abajo). `responded_at`/`suspended_at` quedan NULL hasta que el
-- trigger de más abajo los llena en la transición correspondiente — no
-- confían en que el cliente mande la hora correcta, igual que
-- `update_updated_at()` no confía en que el cliente mande `updated_at`.
--
-- `invited_by` apunta a `municipality_staff`, no a `profiles`: es quién invitó
-- **con qué rol en ese momento**, no la persona en abstracto. `ON DELETE SET
-- NULL` porque perder al empleado que invitó no debe borrar la fila de
-- adhesión — la relación entre el municipio y la veterinaria sigue existiendo.
-- ----------------------------------------------------------------------------
CREATE TABLE municipality_participating_vets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  vet_institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'accepted', 'rejected', 'suspended')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,
  invited_by UUID REFERENCES municipality_staff(id) ON DELETE SET NULL,
  UNIQUE (municipality_id, vet_institution_id)
);

-- Cubre "mis adhesiones en todos los municipios" (lado veterinaria) sin
-- depender del índice del UNIQUE, cuya columna líder es `municipality_id` y no
-- sirve para buscar por `vet_institution_id` sola — mismo motivo que la 024
-- indexa `campaign_neighborhoods(neighborhood_id)` aparte de su PK compuesta.
CREATE INDEX idx_municipality_participating_vets_vet
  ON municipality_participating_vets(vet_institution_id);

-- Cubre "mi padrón de veterinarias, filtrado por estado" (lado municipio).
CREATE INDEX idx_municipality_participating_vets_municipality_status
  ON municipality_participating_vets(municipality_id, status);

-- ----------------------------------------------------------------------------
-- Transición de estado — trigger BEFORE UPDATE, no una política de RLS
--
-- RLS decide con qué filas puede operar cada quien, pero no puede comparar la
-- fila nueva contra la vieja: `USING` mira la fila OLD, `WITH CHECK` mira la
-- fila NEW, y ninguna cláusula ve las dos a la vez. Sin esta función nada
-- impediría un UPDATE que salte directo de "invited" a "suspended", o que el
-- propio municipio se auto-acepte una invitación sin que la veterinaria
-- responda. Mismo motivo que ya obligó a un trigger en `protect_profile_role`
-- (001) y `protect_municipality_validation` (017).
--
-- Quién puede mover qué transición no sale de si la fila "pertenece" a quien
-- llama —eso ya lo filtran las políticas de UPDATE de más abajo— sino de cuál
-- transición puntual es. Un municipio con permiso para tocar esta fila no
-- tiene, solo por eso, permiso para aceptar en nombre de la veterinaria: sus
-- políticas de RLS lo dejarían intentarlo igual (el `USING` no distingue
-- estados), así que es este trigger el que reparte las transiciones por
-- lado, no solo por fila.
--
-- **Se aborta con excepción, no se revierte en silencio** — al revés que
-- `protect_profile_role` / `protect_vet_privileges` / `protect_municipality_validation`,
-- y a favor de `protect_last_municipality_admin` (017/020). La diferencia es
-- la forma de la fila: `profiles` y `vet_professionals` mezclan datos propios
-- legítimos (teléfono, firma) con una columna de privilegio en la misma fila,
-- así que un UPDATE que las combina merece salvar lo legítimo y descartar solo
-- lo que no corresponde. Acá no hay nada que salvar en una transición
-- inválida: la fila entera es una máquina de estados, y un UPDATE que intenta
-- una transición que no existe no trae ningún dato legítimo "de paso" — es,
-- de punta a punta, el intento inválido. Revertir en silencio devolvería un
-- 200 que no hizo lo que el llamador pidió; abortar en voz alta es lo que
-- necesita quien está programando este flujo para saber que su transición
-- fue rechazada — mismo argumento que ya usó la 017/020 para el último admin.
--
-- La reasignación de `municipality_id`/`vet_institution_id` se corta antes de
-- mirar el estado: ninguna política de RLS puede impedir por sí sola que un
-- UPDATE "mueva" esta fila a otra veterinaria u otro municipio (de nuevo,
-- `WITH CHECK` no ve la fila OLD), así que sin este chequeo un municipio
-- podría re-etiquetar la adhesión de una veterinaria como si fuera de otra,
-- sin que esa otra pase nunca por una invitación.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_vet_participation_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.municipality_id IS DISTINCT FROM OLD.municipality_id
     OR NEW.vet_institution_id IS DISTINCT FROM OLD.vet_institution_id
  THEN
    RAISE EXCEPTION
      'No se puede reasignar una fila de adhesión existente a otro municipio u otra veterinaria; hay que suspenderla e invitar de nuevo.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status = OLD.status THEN
    -- Sin cambio de estado: la veterinaria no tiene ninguna columna propia
    -- que editar acá (todo lo demás es historial que administra el
    -- municipio), así que se revierte en silencio si lo intenta — el mismo
    -- patrón de `protect_vet_privileges` (019) para columnas ajenas, no la
    -- máquina de estados en sí.
    IF is_institution_owner(OLD.vet_institution_id) THEN
      NEW.suspension_reason := OLD.suspension_reason;
      NEW.invited_by := OLD.invited_by;
      NEW.invited_at := OLD.invited_at;
    END IF;
    RETURN NEW;
  END IF;

  -- Lado municipio: sólo suspende una adhesión aceptada o reactiva una
  -- suspendida. Nunca decide "accepted" desde "invited" ni "rejected" — eso
  -- es de la veterinaria, más abajo.
  IF my_municipality_id() = OLD.municipality_id THEN
    IF (OLD.status, NEW.status) NOT IN (('accepted', 'suspended'), ('suspended', 'accepted')) THEN
      RAISE EXCEPTION
        'El municipio no puede mover una adhesión de "%" a "%"; sólo puede suspender una aceptada o reactivar una suspendida.',
        OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.status = 'suspended' THEN
      NEW.suspended_at := now();
    ELSE
      NEW.suspended_at := NULL;
      NEW.suspension_reason := NULL;
    END IF;

    RETURN NEW;
  END IF;

  -- Lado veterinaria: sólo responde a una invitación pendiente, en un
  -- sentido o en otro. Nunca decide "suspended" — eso es del municipio.
  IF is_institution_owner(OLD.vet_institution_id) THEN
    IF (OLD.status, NEW.status) NOT IN (('invited', 'accepted'), ('invited', 'rejected')) THEN
      RAISE EXCEPTION
        'La veterinaria no puede mover una adhesión de "%" a "%"; sólo puede aceptar o rechazar una invitación pendiente.',
        OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;

    NEW.responded_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'No se pudo determinar quién intenta este cambio de estado de adhesión.'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_vet_participation_transition IS
  'Máquina de estados de municipality_participating_vets: invited→accepted/'
  'rejected (veterinaria), accepted↔suspended (municipio). Aborta con '
  'restrict_violation ante cualquier otra transición o reasignación de fila.';

CREATE TRIGGER municipality_participating_vets_enforce_transition
  BEFORE UPDATE ON municipality_participating_vets
  FOR EACH ROW EXECUTE FUNCTION enforce_vet_participation_transition();

-- ============================================================================
-- ROW LEVEL SECURITY — municipality_participating_vets
-- ============================================================================

ALTER TABLE municipality_participating_vets ENABLE ROW LEVEL SECURITY;

-- Nunca FORCE ROW LEVEL SECURITY — mismo motivo que la 017/024: las funciones
-- auxiliares (`is_institution_owner`, `my_municipality_id`, etc.) necesitan
-- que el dueño de esta tabla quede exento de su propia RLS.

-- Lectura: el municipio ve su propio padrón de veterinarias (cualquier rol,
-- incluido readonly — es sólo consulta); la veterinaria ve sus propias filas
-- en cualquier municipio con el que tenga o haya tenido una adhesión.
CREATE POLICY "municipality_participating_vets_select_municipality"
  ON municipality_participating_vets FOR SELECT
  USING (municipality_id = my_municipality_id());

CREATE POLICY "municipality_participating_vets_select_clinic"
  ON municipality_participating_vets FOR SELECT
  USING (is_institution_owner(vet_institution_id));

-- Alta: sólo el municipio invita, nunca la veterinaria. La adhesión
-- "invitation-only" queda garantizada estructuralmente acá — el `WITH CHECK`
-- exige `my_municipality_id()`, así que una veterinaria no tiene ningún
-- camino para crearse su propia fila — y `status = 'invited'` cierra el
-- resto: ni siquiera el municipio puede insertar una fila ya "accepted",
-- salteando la respuesta de la veterinaria.
CREATE POLICY "municipality_participating_vets_insert"
  ON municipality_participating_vets FOR INSERT
  WITH CHECK (
    municipality_id = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
    AND status = 'invited'
  );

-- Edición: dos políticas PERMISSIVE que Postgres combina con OR. Cada una
-- sólo decide **si la fila es alcanzable** por ese lado; qué transición
-- puntual es legal lo decide el trigger de arriba, no esta política.
CREATE POLICY "municipality_participating_vets_update_municipality"
  ON municipality_participating_vets FOR UPDATE
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

CREATE POLICY "municipality_participating_vets_update_clinic"
  ON municipality_participating_vets FOR UPDATE
  USING (is_institution_owner(vet_institution_id))
  WITH CHECK (is_institution_owner(vet_institution_id));

-- Sin DELETE: la adhesión se suspende, no se borra — el padrón de "con quién
-- trabajó alguna vez el municipio" es historia, igual que el registro de
-- auditoría del censo es append-only por el mismo motivo de fondo.

-- ----------------------------------------------------------------------------
-- campaign_participating_vets — quién staffea una campaña puntual
--
-- Join entre `campaigns` y `vet_institutions`, con acompañamiento de
-- auditoría (`added_at`/`added_by`) en vez de columnas propias que editar: por
-- eso no hay política de UPDATE, igual que `campaign_neighborhoods` (024) —
-- cambiar quién staffea una campaña es borrar la fila vieja e insertar la
-- nueva, nunca un UPDATE. La clave primaria compuesta reemplaza a un `id`
-- propio, mismo motivo que esa misma tabla.
--
-- `added_by` referencia `municipality_staff`, no `profiles`, por la misma
-- razón que `invited_by` de arriba: es el rol en el momento del alta, no la
-- persona en abstracto. Ninguna de las dos columnas la llena un trigger: las
-- llena la capa de acciones que hace el INSERT (fuera de esta migración),
-- igual que `actor_label`/`actor_role` del registro de auditoría del censo
-- (023) los llena la función que hace el INSERT, no un trigger de esta tabla.
-- ----------------------------------------------------------------------------
CREATE TABLE campaign_participating_vets (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  vet_institution_id UUID NOT NULL REFERENCES vet_institutions(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES municipality_staff(id) ON DELETE SET NULL,
  PRIMARY KEY (campaign_id, vet_institution_id)
);

CREATE INDEX idx_campaign_participating_vets_vet
  ON campaign_participating_vets(vet_institution_id);

-- ============================================================================
-- ROW LEVEL SECURITY — campaign_participating_vets
-- ============================================================================

ALTER TABLE campaign_participating_vets ENABLE ROW LEVEL SECURITY;

-- Lectura: el municipio ve el staffing de sus propias campañas (vía
-- `campaign_municipality_id()`, igual que `campaign_locations`/
-- `campaign_neighborhoods` de la 024); la veterinaria ve en qué campañas la
-- staffearon, de cualquier municipio.
CREATE POLICY "campaign_participating_vets_select_municipality"
  ON campaign_participating_vets FOR SELECT
  USING (campaign_municipality_id(campaign_id) = my_municipality_id());

CREATE POLICY "campaign_participating_vets_select_clinic"
  ON campaign_participating_vets FOR SELECT
  USING (is_institution_owner(vet_institution_id));

-- Alta: la regla que hace que separar las dos tablas valga la pena. No
-- alcanza con que la veterinaria pertenezca a la jurisdicción del operativo:
-- tiene que estar **aceptada** en `municipality_participating_vets` para ESE
-- municipio. Sin este EXISTS, staffear una campaña sería una segunda puerta
-- para sumar una veterinaria nunca invitada — el CHECK que hace estructural
-- la política de la otra tabla quedaría de adorno.
--
-- Las columnas de la derecha de cada comparación se califican con el nombre
-- de esta tabla (`campaign_participating_vets.…`) a propósito: la subconsulta
-- trae su propia fila de `municipality_participating_vets`, que tiene una
-- columna con el mismo nombre (`vet_institution_id`); sin calificar, Postgres
-- resolvería la referencia contra esa subconsulta en vez de contra la fila
-- que se está insertando — un bug silencioso, no un error de sintaxis.
CREATE POLICY "campaign_participating_vets_insert"
  ON campaign_participating_vets FOR INSERT
  WITH CHECK (
    campaign_municipality_id(campaign_id) = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
    AND EXISTS (
      SELECT 1 FROM municipality_participating_vets mpv
      WHERE mpv.municipality_id = my_municipality_id()
        AND mpv.vet_institution_id = campaign_participating_vets.vet_institution_id
        AND mpv.status = 'accepted'
    )
  );

-- Baja: sacar a una veterinaria de una campaña no exige que siga "accepted"
-- —si mientras tanto la suspendieron, el municipio tiene que poder
-- desafectarla igual—, sólo que la campaña sea suya.
CREATE POLICY "campaign_participating_vets_delete"
  ON campaign_participating_vets FOR DELETE
  USING (
    campaign_municipality_id(campaign_id) = my_municipality_id()
    AND is_validated_municipality()
    AND my_municipality_role() IN ('admin', 'operator')
  );

-- ROLLBACK
-- DROP TRIGGER IF EXISTS municipality_participating_vets_enforce_transition ON municipality_participating_vets;
-- DROP FUNCTION IF EXISTS enforce_vet_participation_transition();
-- DROP TABLE IF EXISTS campaign_participating_vets CASCADE;
-- DROP TABLE IF EXISTS municipality_participating_vets CASCADE;
--
-- Adición pura: no se pierde ningún dato preexistente. Se revierte en orden
-- inverso al de creación (primero la tabla que referencia a `campaigns`, la
-- otra al final) por prolijidad de la secuencia de migraciones, no por
-- integridad de datos — ninguna FK de esta migración apunta desde afuera
-- hacia adentro.
