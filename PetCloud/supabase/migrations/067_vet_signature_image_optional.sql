-- ============================================================================
-- 067 · El dibujo es opcional; la firma no
-- ============================================================================
--
-- DECISIÓN DE PRODUCTO (2026-09-23, con el primer profesional real probando el
-- sistema): dibujar la firma a mano NO puede ser obligatorio para registrar
-- una firma. Sí siguen siendo obligatorios el nombre, el apellido —ya vienen
-- del perfil— y la matrícula, más la declaración jurada. El dibujo, si lo
-- hay, se agrega; si no, la firma queda igual de válida.
--
-- Esto no es nuevo en el sistema: `insertarFirma()` (`src/lib/pdf/firma.ts`)
-- YA acepta `url: string | null` y cae al texto de respaldo cuando no hay
-- imagen — es el mismo camino que corría antes de la 063 para todo el mundo.
-- Lo que hace esta migración es dejar que una firma REGISTRADA entre por ese
-- camino a propósito, en vez de forzar siempre el dibujo.
--
-- LO QUE NO CAMBIA
--
-- Sigue existiendo como fila. Sigue siendo append-only, sigue habiendo una
-- sola vigente por profesional, sigue exigiendo la declaración jurada con su
-- texto exacto y su fecha. El portón de la 065 sigue mirando
-- `current_vet_signature_id()`: una firma sin dibujo destraba igual, porque
-- lo que exige el portón es que la persona haya declarado, no que haya
-- dibujado.
-- ----------------------------------------------------------------------------

-- El CHECK de largo no tiene sentido sobre NULL — un CHECK ya deja pasar NULL
-- por definición, así que esto es solo higiene: si en algún momento se
-- guardara un string vacío en vez de NULL, sigue rechazado.
ALTER TABLE vet_signatures
  ALTER COLUMN image_path DROP NOT NULL;

-- El UNIQUE de Postgres ya no compara dos NULL entre sí (son valores
-- desconocidos, nunca iguales), así que dos firmas sin dibujo del mismo o de
-- distintos profesionales no chocan. No hace falta tocar el índice.

ALTER TABLE vet_signatures
  DROP CONSTRAINT vet_signatures_path_matches_owner;

ALTER TABLE vet_signatures
  ADD CONSTRAINT vet_signatures_path_matches_owner
  CHECK (image_path IS NULL OR image_path LIKE vet_professional_id::text || '/%');

COMMENT ON COLUMN vet_signatures.image_path IS
  'Ruta del PNG en el bucket vet-signatures. NULL cuando la persona no '
  'dibujó: la firma sigue siendo válida y el documento cae al texto de '
  'respaldo, igual que antes de la 063.';

-- ----------------------------------------------------------------------------
-- register_vet_signature() acepta el dibujo como opcional
--
-- `p_image_path` pasa a NULLABLE. La acción del lado TypeScript decide subir o
-- no subir un archivo antes de llamar acá; esta función no sabe ni le importa
-- si hubo un `upload` — solo persiste lo que le llega.
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE no alcanza: cambiar el orden de los parámetros cambia la
-- firma posicional, así que Postgres crearía un OVERLOAD nuevo en vez de
-- reemplazar la función de la 063. Hay que borrar esa firma exacta primero.
DROP FUNCTION IF EXISTS register_vet_signature(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION register_vet_signature(
  p_clarification TEXT,
  p_license_number TEXT,
  p_sworn_statement TEXT,
  p_image_path TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  UPDATE vet_signatures SET superseded_at = now()
   WHERE vet_professional_id = my_vet_professional_id()
     AND superseded_at IS NULL;

  INSERT INTO vet_signatures (
    vet_professional_id, image_path, clarification, license_number, sworn_statement
  ) VALUES (
    my_vet_professional_id(),
    NULLIF(trim(coalesce(p_image_path, '')), ''),
    trim(p_clarification),
    trim(p_license_number),
    p_sworn_statement
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- El DROP de más arriba se llevó puesto el GRANT de la firma vieja: hay que
-- volver a concederlo sobre la firma nueva.
GRANT EXECUTE ON FUNCTION register_vet_signature(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS register_vet_signature(TEXT, TEXT, TEXT, TEXT);
--
-- CREATE OR REPLACE FUNCTION register_vet_signature(
--   p_image_path TEXT,
--   p_clarification TEXT,
--   p_license_number TEXT,
--   p_sworn_statement TEXT
-- ) RETURNS UUID AS $$
-- DECLARE
--   v_id UUID;
-- BEGIN
--   UPDATE vet_signatures SET superseded_at = now()
--    WHERE vet_professional_id = my_vet_professional_id()
--      AND superseded_at IS NULL;
--
--   INSERT INTO vet_signatures (
--     vet_professional_id, image_path, clarification, license_number, sworn_statement
--   ) VALUES (
--     my_vet_professional_id(), p_image_path, trim(p_clarification),
--     trim(p_license_number), p_sworn_statement
--   ) RETURNING id INTO v_id;
--
--   RETURN v_id;
-- END;
-- $$ LANGUAGE plpgsql SET search_path = public;
--
-- ALTER TABLE vet_signatures DROP CONSTRAINT vet_signatures_path_matches_owner;
-- ALTER TABLE vet_signatures ADD CONSTRAINT vet_signatures_path_matches_owner
--   CHECK (image_path LIKE vet_professional_id::text || '/%');
-- ALTER TABLE vet_signatures ALTER COLUMN image_path SET NOT NULL;
-- GRANT EXECUTE ON FUNCTION register_vet_signature(TEXT, TEXT, TEXT, TEXT) TO authenticated;
