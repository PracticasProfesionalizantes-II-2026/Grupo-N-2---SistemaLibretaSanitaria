-- ============================================================================
-- PetCloud — Migración 031: qué veterinarias staffean una campaña pública
--
-- La 024 le dio a `campaigns`/`campaign_locations`/`campaign_neighborhoods`
-- cada una su policy `_select_public` (`campaign_is_public()` — cualquier
-- sesión, incluida la anónima, ve lo que no sea borrador ni cancelada). La 025
-- (T10) armó `campaign_participating_vets` con lectura para el municipio
-- dueño y para la propia veterinaria, pero nunca le sumó la tercera pata del
-- mismo patrón — quedó afuera del alcance de esa migración, no a propósito.
--
-- Sin esta policy, un vecino mirando una campaña pública (T21/T22:
-- `getPublicCampaign`/`getClinicsForCampaign`) nunca ve qué veterinarias
-- participan: la fila existe, pero RLS la esconde de cualquiera que no sea el
-- municipio o la propia clínica. `vet_institution_id` y `campaign_id` no son
-- datos personales de nadie — son exactamente el mismo tipo de dato que
-- `campaign_locations` ya expone en público (dónde ir a vacunar a la
-- mascota), así que el mismo predicado `campaign_is_public()` alcanza, sin
-- necesitar una función `SECURITY DEFINER` nueva.
-- ============================================================================

CREATE POLICY "campaign_participating_vets_select_public"
  ON campaign_participating_vets FOR SELECT
  USING (campaign_is_public(campaign_id));

-- ROLLBACK
-- DROP POLICY IF EXISTS "campaign_participating_vets_select_public" ON campaign_participating_vets;
--
-- Adición pura. Sin esta policy, campaign_participating_vets vuelve al estado
-- de la 025: visible solo para el municipio dueño y la propia veterinaria.
