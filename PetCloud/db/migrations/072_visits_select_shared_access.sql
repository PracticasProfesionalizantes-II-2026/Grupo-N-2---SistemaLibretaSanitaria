-- ============================================================================
-- PetCloud — Migración 072: el codueño también ve las visitas de la mascota
-- ============================================================================
--
-- `visits_select` (008) usa `owner_id = auth.uid()`, no `has_pet_access()`.
-- La 062 ya había dejado anotada la asimetría: el codueño (034/035) ve los
-- turnos de la mascota compartida (porque `get_pet_appointments` y el widget
-- de inicio usan `has_pet_access()`), pero no las visitas — la cola de la
-- veterinaria, el estado en tiempo real de "está pasando ahora". Un dato que
-- aparece en la pantalla de turnos y desaparece en la de visitas es la misma
-- inconsistencia que la 062 documentó del otro lado.
--
-- La solución es la misma: reemplazar la columna directa por `has_pet_access()`,
-- que ya cubre owner directo + codueño con acceso aceptado en
-- `pet_shared_access` (035), con el nivel mínimo por defecto ('view'). La rama
-- de la veterinaria (`institution_id = my_vet_institution_id()`) queda igual
-- que en la 008.

DROP POLICY IF EXISTS "visits_select" ON visits;

CREATE POLICY "visits_select" ON visits FOR SELECT
  USING (institution_id = my_vet_institution_id() OR has_pet_access(pet_id));
