-- ============================================================================
-- 074 — create_pet_access_request_by_address() devuelve a quién le pidió
-- ============================================================================
-- La 073 devolvía solo un INTEGER con la cantidad de solicitudes creadas, y la
-- Server Action tenía que releer `pet_access_requests` filtrando por
-- `created_at >= <hora de Node>` para saber a quién notificar. Esa hora sale
-- del reloj de la aplicación y `created_at` del de Postgres: si la base
-- atrasa, las filas recién creadas quedan afuera y el dueño nunca se entera.
--
-- Ahora la función devuelve los `target_owner_id` de las filas que insertó
-- esta misma llamada (`RETURNING`). Las que ya estaban pendientes no se
-- devuelven (`ON CONFLICT DO NOTHING` no las incluye), así que nadie recibe
-- una notificación repetida.
--
-- Cambia el tipo de retorno, y Postgres no permite eso con CREATE OR REPLACE:
-- hay que borrarla y recrearla, y con ella sus permisos de ejecución.
-- ============================================================================

DROP FUNCTION IF EXISTS create_pet_access_request_by_address();

CREATE FUNCTION create_pet_access_request_by_address()
RETURNS TABLE (target_owner_id UUID) AS $$
#variable_conflict use_column
DECLARE
  v_address TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT address_normalized INTO v_address
  FROM profiles WHERE id = auth.uid();

  IF v_address IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO pet_access_requests (requester_id, target_owner_id)
  SELECT auth.uid(), pr.id
  FROM profiles pr
  WHERE pr.address_normalized = v_address
    AND pr.id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM pets p
      WHERE p.owner_id = pr.id
         OR EXISTS (
           SELECT 1 FROM pet_shared_access psa
           WHERE psa.pet_id = p.id AND psa.shared_with_id = pr.id
             AND psa.permission = 'owner'
         )
    )
  ON CONFLICT (requester_id, target_owner_id) WHERE status = 'pending'
    DO NOTHING
  RETURNING pet_access_requests.target_owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION create_pet_access_request_by_address() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_pet_access_request_by_address() TO authenticated;

-- ----------------------------------------------------------------------------
-- Rollback: recrear la versión de la 073 (RETURNS INTEGER), previo
-- DROP FUNCTION IF EXISTS create_pet_access_request_by_address();
-- ----------------------------------------------------------------------------
