-- ============================================================================
-- 066 · El archivo de una firma tampoco se toca, y esta vez tampoco desde el
--       service_role
-- ============================================================================
--
-- POR QUÉ HACE FALTA ESTA MIGRACIÓN
--
-- La 063 dejó el bucket `vet-signatures` de escritura única sacándole las
-- políticas de UPDATE y DELETE de la 010. Eso alcanza para `authenticated`:
-- sin política no hay permiso. Para `service_role` no alcanza NADA de eso,
-- porque tiene `rolbypassrls` y las políticas no lo miran.
--
-- Verificado contra el stack local con la clave de servicio, no deducido:
--
--     subir  -> OK
--     pisar  -> OK   y el archivo devolvió los bytes NUEVOS
--     borrar -> OK
--
-- Y eso rompe el congelado entero. La 063 blindó la FILA contra `service_role`
-- a propósito —"ni el seed modifica una firma", con su trigger sin exención de
-- rol— pero el ARCHIVO al que esa fila apunta se quedó afuera. Una historia
-- clínica firmada tiene su `signature_id` inmutable, apuntando a una fila
-- inmutable, cuyo `image_path` apunta a un objeto cuyos BYTES cualquier cosa
-- que corra con la clave de servicio puede reemplazar. El PDF renderiza los
-- bytes nuevos. El congelado queda decorativo justo donde más importa.
--
-- La asimetría no estaba decidida en ningún lado: es un descuido, y lo
-- encontró la fase de verificación del ciclo.
--
-- POR QUÉ UN TRIGGER Y NO UNA POLÍTICA
--
-- Una política de RLS no se evalúa para un rol con `rolbypassrls`. Un trigger
-- sí corre, siempre, sea cual sea el rol que llama. Es exactamente el mismo
-- razonamiento —y la misma técnica— que la 048 y la 063 usaron para la fila.
-- Sin `SECURITY DEFINER` y sin exención de rol de ningún tipo: si en algún
-- momento hace falta mover un archivo de firma, se hace con una migración que
-- diga por qué, no con un script que pase por abajo.
--
-- LO QUE SIGUE PERMITIDO
--
-- Borrar un objeto que ninguna firma reclamó. Ese es el rollback de una subida
-- fallida: `signature-actions.ts` sube primero el archivo y escribe la fila
-- después, y si la fila falla tiene que poder sacar el huérfano. Mismo
-- predicado que ya usa la política de la 063.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_signature_object_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.bucket_id IS DISTINCT FROM 'vet-signatures' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Un objeto que ninguna firma reclamó no es todavía una firma: es un archivo
  -- a medio subir. Sacarlo es el rollback, no una reescritura de la historia.
  IF NOT EXISTS (SELECT 1 FROM public.vet_signatures WHERE image_path = OLD.name)
  THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El archivo de una firma registrada no se borra: la firma se reemplaza y queda en el historial.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RAISE EXCEPTION 'El archivo de una firma registrada no se modifica. Una firma nueva es una fila nueva, con su propio archivo.'
    USING ERRCODE = 'restrict_violation';
END;
-- Sin SECURITY DEFINER: el trigger corre con los permisos de quien llama y no
-- necesita más. Eximir a `postgres` sería regalar de vuelta lo que esta
-- migración viene a cerrar.
$$ LANGUAGE plpgsql SET search_path = public;

COMMENT ON FUNCTION enforce_signature_object_immutable IS
  'El objeto de una firma ya registrada no se modifica ni se borra, para '
  'ningun rol. Un trigger corre aunque el rol tenga rolbypassrls; una politica '
  'de RLS no. Lo no reclamado por ninguna fila si se puede borrar: es el '
  'rollback de una subida fallida.';

DROP TRIGGER IF EXISTS vet_signature_object_immutable ON storage.objects;
CREATE TRIGGER vet_signature_object_immutable
  BEFORE UPDATE OR DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION enforce_signature_object_immutable();

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS vet_signature_object_immutable ON storage.objects;
-- DROP FUNCTION IF EXISTS enforce_signature_object_immutable();
