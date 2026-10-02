-- ============================================================================
-- PetCloud — Migración 063: el registro de firmas del profesional
--
-- POR QUÉ EXISTE
--
-- La subida de firma es una fachada: `vet-settings-view.tsx:206-245` dibuja un
-- `<input type="file">` cuyo único efecto es un `toast.success`. No hay Server
-- Action, no hay escritura en Storage, no hay columna que se actualice. Por eso
-- `vet_professionals.signature_url` (001:182) está en NULL desde el día que se
-- creó, y todos los PDF caen en el texto de reemplazo.
--
-- Esta migración construye el sustrato: una tabla de firmas donde cada firma es
-- una fila inmutable, el puntero que después van a estampar los registros
-- firmados, y el endurecimiento del bucket sin el cual todo lo demás es
-- decorativo.
--
-- LA 063 NO EXIGE NADA TODAVÍA. Ninguna guarda de firma cambia acá. Si esta
-- migración pidiera una firma para firmar, el día que se aplica nadie tiene
-- una y la clínica entera deja de poder firmar. El congelamiento llega en la
-- 064 y el rechazo en la 065, cuando ya hubo tiempo de cargarla.
--
-- POR QUÉ 063 Y NO 059
--
-- Este ciclo se planificó sobre 059/060/061 y el PR #89 se llevó 059-062 la
-- misma tarde, ya aplicadas en producción. Reservar un número en un documento
-- no lo reserva en el repositorio: se reserva cuando el archivo existe y está
-- pusheado. Anotado en `docs/desarrollo/trampas-conocidas.md`.
--
-- POLÍTICAS REEMPLAZADAS, ANOTADAS PARA PODER VOLVER
--
--   · "vet_signatures_update" ON storage.objects — cuerpo de la 010:100-106.
--   · "vet_signatures_delete" ON storage.objects — cuerpo de la 010:108-112.
--
-- Las dos dejaban que un profesional pisara o borrara su propio archivo de
-- firma. Una fila inmutable que apunta a un objeto mutable congela **una ruta,
-- no una firma**: se vuelve a subir en la misma ruta y todos los certificados
-- ya emitidos muestran el dibujo nuevo, en silencio, hacia atrás. La base nunca
-- ve los bytes, así que no puede detectarlo. El plan de reversión al pie las
-- restaura tal cual.
--
-- EL TRIGGER DE SOLO-ALTA NO TIENE EXENCIÓN DE ROL, A PROPÓSITO
--
-- La 046 dio por append-only una tabla «porque no tiene políticas» y la 048
-- tuvo que corregirlo: `service_role` tiene `rolbypassrls` y la ausencia de
-- políticas no lo frena. La 056 cerró el mismo agujero del otro lado. Acá la
-- inmutabilidad la garantiza un trigger, que corre para todos los roles: ni el
-- seed modifica una firma.
--
-- LO QUE ESTO ROMPE, VERIFICADO EN EL REPOSITORIO Y NO SUPUESTO
--
-- Con DELETE siempre rechazado y la FK a `vet_professionals(id)` sin ON DELETE,
-- **borrar la cuenta de un profesional que registró una firma falla** (23503).
-- No es una regresión: seis FK de la 002 y la 008 ya hacen exactamente eso con
-- quien firmó un registro clínico, y por eso la 058 introdujo `removed_at` como
-- baja blanda. Las rutas de borrado reales hoy son dos y ninguna se topa con
-- esto: el rollback de un alta fallida (`register-actions.ts:182`) borra una
-- institución creada segundos antes, sin firmas, y la 058 ya quitó la política
-- de DELETE de `vet_professionals` para `authenticated`. Lo que sí cambia es la
-- limpieza de las pruebas de RLS: la cuenta de un veterinario que registró una
-- firma sobrevive a `limpiar()`, y se va con `npx supabase db reset`.
--
-- NUNCA `FORCE ROW LEVEL SECURITY`, ni acá ni en `vet_professionals`. Las
-- funciones `SECURITY DEFINER` de abajo leen estas tablas desde políticas, y lo
-- único que evita la recursión es que la dueña de la tabla quede exenta de su
-- propia RLS. Mismo motivo que 005/017/023/045/046/058.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Una fila inmutable por firma
--
-- La aclaración vive acá y no en `profiles`: el nombre de un sello puede ser
-- legítimamente distinto del nombre legal de la cuenta. Y vive en esta fila y
-- no en `vet_professionals` porque una aclaración mutable reabriría el mismo
-- agujero que el congelamiento cierra.
--
-- `sworn_statement` guarda el texto exacto que la persona aceptó, no un
-- booleano: una declaración jurada que incide en la validez de un documento
-- clínico no es aceptar términos de servicio.
-- ----------------------------------------------------------------------------
CREATE TABLE vet_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vet_professional_id UUID NOT NULL REFERENCES vet_professionals(id),
  image_path      TEXT NOT NULL UNIQUE CHECK (length(trim(image_path)) > 0),
  clarification   TEXT NOT NULL CHECK (length(trim(clarification)) > 0),
  license_number  TEXT NOT NULL CHECK (length(trim(license_number)) > 0),
  sworn_statement TEXT NOT NULL CHECK (length(trim(sworn_statement)) > 0),
  sworn_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at   TIMESTAMPTZ,
  -- La ruta del objeto y la fila dicen lo mismo: la seguridad del bucket sale
  -- del primer segmento (010), así que una fila no puede apuntar a la carpeta
  -- de otro profesional.
  CONSTRAINT vet_signatures_path_matches_owner
    CHECK (image_path LIKE vet_professional_id::text || '/%')
);

COMMENT ON TABLE vet_signatures IS
  'Historial de firmas del profesional. Cada fila es inmutable: una firma nueva '
  'no pisa a la anterior, la reemplaza (`superseded_at`) y las dos quedan '
  'legibles. De ahí sale qué firma estaba vigente en una fecha dada.';

-- Una sola vigente por profesional; el resto es historia. Lo garantiza el
-- motor, no el código. Parcial a propósito: una unicidad plena impediría el
-- historial, que es justamente lo que se quiere conservar.
CREATE UNIQUE INDEX idx_vet_signatures_current
  ON vet_signatures(vet_professional_id) WHERE superseded_at IS NULL;

CREATE INDEX idx_vet_signatures_professional
  ON vet_signatures(vet_professional_id, created_at DESC);

ALTER TABLE vet_signatures ENABLE ROW LEVEL SECURITY;

-- El dueño de la firma la ve, y también el dueño de una mascota a la que ese
-- profesional le firmó algo: la firma es parte de ese documento. Es la misma
-- excepción que ya rige el bucket desde la 010, apoyada en la misma función.
CREATE POLICY "vet_signatures_select" ON vet_signatures FOR SELECT
  TO authenticated
  USING (
    vet_professional_id = my_vet_professional_id()
    OR signed_for_my_pet(vet_professional_id)
  );

-- `is_validated_vet()` acá, y no solo la pertenencia: una recepcionista tiene
-- `license_number` forzado a NULL por el CHECK de la 058, así que nunca podría
-- usar una firma —ninguna guarda de firma la acepta—, pero sin esta condición
-- podría igual escribir la fila. Una tabla que acepta filas inservibles es una
-- tabla que miente sobre su propio contenido. El rechazo pasa a estar en la
-- base, que es donde el spec lo pide, y no en un control deshabilitado.
CREATE POLICY "vet_signatures_insert" ON vet_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    vet_professional_id = my_vet_professional_id()
    AND is_validated_vet()
  );

-- La única UPDATE que existe es marcar el reemplazo; el trigger de abajo
-- controla que no se cambie nada más. Sin política de DELETE: una firma no se
-- borra, se reemplaza.
CREATE POLICY "vet_signatures_supersede" ON vet_signatures FOR UPDATE
  TO authenticated
  USING (
    vet_professional_id = my_vet_professional_id()
    AND superseded_at IS NULL
  )
  WITH CHECK (vet_professional_id = my_vet_professional_id());

-- ----------------------------------------------------------------------------
-- 2 · Solo-alta por trigger, no por ausencia de políticas
--
-- Ver el encabezado: `service_role` saltea la RLS y un trigger no. Sin exención
-- de rol de ningún tipo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_vet_signature_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una firma no se borra: se reemplaza y queda en el historial.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Una firma ya reemplazada no se modifica.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'Lo único que se le puede hacer a una firma es marcarla reemplazada.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- La única transición: `superseded_at` de NULL a un valor. Todo lo demás,
  -- igual. La comparación va con jsonb y no con una lista de columnas escrita a
  -- mano por lo mismo que en la 048 y la 056: una columna que agregue una
  -- migración futura entra sola en la igualdad, en vez de quedar
  -- silenciosamente modificable.
  IF (to_jsonb(NEW) - 'superseded_at'::text)
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'superseded_at'::text)
  THEN
    RAISE EXCEPTION 'De una firma solo cambia su fecha de reemplazo.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
-- Sin SECURITY DEFINER: un trigger corre igual sea cual sea el rol, y eximir a
-- `postgres` dejaría que nuestras propias RPC reescriban el historial.
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER vet_signatures_append_only
  BEFORE UPDATE OR DELETE ON vet_signatures
  FOR EACH ROW EXECUTE FUNCTION enforce_vet_signature_append_only();

-- TRUNCATE no produce filas, así que un trigger FOR EACH ROW no lo ve y vaciar
-- la tabla entera esquivaría todo lo de arriba. Mismo criterio que la 048 y la
-- 056.
CREATE OR REPLACE FUNCTION enforce_vet_signature_no_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El historial de firmas no se vacía.'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER vet_signatures_no_truncate
  BEFORE TRUNCATE ON vet_signatures
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_vet_signature_no_truncate();

-- ----------------------------------------------------------------------------
-- 3 · El predicado compartido: una sola definición de "cuál es tu firma"
--
-- Sin `SECURITY DEFINER` a propósito: corre bajo la RLS de quien llama, así que
-- nunca puede devolver la firma de otro. Las guardas de la 064 y la 065 la van
-- a llamar desde los tres triggers de firma; se define acá porque el sustrato
-- es esta migración.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_vet_signature_id()
RETURNS UUID AS $$
  SELECT id FROM vet_signatures
  WHERE vet_professional_id = my_vet_professional_id()
    AND superseded_at IS NULL;
$$ LANGUAGE sql STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- 4 · Los punteros, nullables y sin ninguna guarda que los llene todavía
--
-- Tres columnas y no una porque las tres superficies que firman escriben tres
-- tablas distintas: la consulta `medical_records.is_signed`, la vacunación
-- `vaccinations.verified`, y el certificado un PDF en `pet_documents`.
--
-- `ON DELETE RESTRICT`: borrar una firma que respalda un documento tiene que
-- fallar ruidosamente, no dejar el documento huérfano.
--
-- NULL a propósito: lo firmado antes de la 063 no tiene firma y nunca la va a
-- tener, así que el PDF sigue diciendo solo lo que puede probar — el texto de
-- reemplazo que ya renderiza hoy.
-- ----------------------------------------------------------------------------
ALTER TABLE medical_records
  ADD COLUMN signature_id UUID REFERENCES vet_signatures(id) ON DELETE RESTRICT;
ALTER TABLE vaccinations
  ADD COLUMN signature_id UUID REFERENCES vet_signatures(id) ON DELETE RESTRICT;
ALTER TABLE pet_documents
  ADD COLUMN signature_id UUID REFERENCES vet_signatures(id) ON DELETE RESTRICT;

COMMENT ON COLUMN vet_professionals.signature_url IS
  'DEPRECADA por la 063. Siempre NULL: la subida nunca existió. La firma vive '
  'en vet_signatures; esta columna deja de leerse en la 064. Se elimina en una '
  'limpieza aparte, cuando ningún código la nombre.';

-- ----------------------------------------------------------------------------
-- 5 · Reemplazar y crear, en una sola transacción
--
-- El índice parcial obliga el orden —primero se marca reemplazada la vigente,
-- después se inserta la nueva— y `superseded_at` es puerta de ida: partido en
-- dos llamadas, un fallo en el medio deja al profesional sin firma vigente y
-- sin vuelta atrás.
--
-- `SECURITY INVOKER` a propósito, y ahí se separa del molde de
-- `accept_team_invite` (058): esta función toca una sola tabla, que quien llama
-- puede leer y escribir bajo sus propias políticas. La RLS sigue siendo la
-- frontera, incluida la condición de matrícula validada del INSERT.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_vet_signature(
  p_image_path TEXT,
  p_clarification TEXT,
  p_license_number TEXT,
  p_sworn_statement TEXT
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
    my_vet_professional_id(), p_image_path, trim(p_clarification),
    trim(p_license_number), p_sworn_statement
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

GRANT EXECUTE ON FUNCTION register_vet_signature(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION current_vet_signature_id() TO authenticated;

-- ----------------------------------------------------------------------------
-- 6 · El bucket, write-once
--
-- Las dos políticas de la 010 se retiran (ver el encabezado). Lo que queda es
-- un único DELETE con alcance estrecho: un objeto que **ninguna fila de firma
-- nombra**. Ese agujero existe para que el rollback del molde de subida
-- (`documents-actions.ts:102-107`) siga siendo real — se sube primero, se
-- escribe la base después, y si la base rechaza hay que poder sacar el archivo
-- huérfano. Un objeto que nadie reclamó todavía no es una firma; en el momento
-- en que una fila lo nombra, queda congelado para siempre.
--
-- `signature_object_unclaimed()` es `SECURITY DEFINER` porque una política de
-- RLS nunca consulta directo otra tabla con RLS (regla de la 005). No es el
-- error de la 009: aquella era una guarda razonando sobre `current_user`
-- adentro de una función definer. Esta no lee `current_user` en ningún lado,
-- exactamente como `signed_for_my_pet()` al lado suyo.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "vet_signatures_update" ON storage.objects;
DROP POLICY IF EXISTS "vet_signatures_delete" ON storage.objects;

CREATE OR REPLACE FUNCTION signature_object_unclaimed(p_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM vet_signatures WHERE image_path = p_name
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE POLICY "vet_signatures_delete_unclaimed" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vet-signatures'
    AND storage_professional_id(name) = my_vet_professional_id()
    AND signature_object_unclaimed(name)
  );

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP POLICY IF EXISTS "vet_signatures_delete_unclaimed" ON storage.objects;
-- DROP FUNCTION IF EXISTS signature_object_unclaimed(TEXT);
--
-- -- Las dos políticas de la 010:100-112, tal cual estaban:
-- CREATE POLICY "vet_signatures_update" ON storage.objects FOR UPDATE
--   TO authenticated
--   USING (
--     bucket_id = 'vet-signatures'
--     AND storage_professional_id(name) = my_vet_professional_id()
--   );
-- CREATE POLICY "vet_signatures_delete" ON storage.objects FOR DELETE
--   TO authenticated
--   USING (
--     bucket_id = 'vet-signatures'
--     AND storage_professional_id(name) = my_vet_professional_id()
--   );
--
-- REVOKE EXECUTE ON FUNCTION current_vet_signature_id() FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION register_vet_signature(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
-- DROP FUNCTION IF EXISTS register_vet_signature(TEXT, TEXT, TEXT, TEXT);
--
-- COMMENT ON COLUMN vet_professionals.signature_url IS NULL;
-- ALTER TABLE pet_documents DROP COLUMN IF EXISTS signature_id;
-- ALTER TABLE vaccinations DROP COLUMN IF EXISTS signature_id;
-- ALTER TABLE medical_records DROP COLUMN IF EXISTS signature_id;
--
-- DROP FUNCTION IF EXISTS current_vet_signature_id();
-- DROP TRIGGER IF EXISTS vet_signatures_no_truncate ON vet_signatures;
-- DROP TRIGGER IF EXISTS vet_signatures_append_only ON vet_signatures;
-- DROP FUNCTION IF EXISTS enforce_vet_signature_no_truncate();
-- DROP FUNCTION IF EXISTS enforce_vet_signature_append_only();
-- DROP TABLE IF EXISTS vet_signatures CASCADE;
--
-- Volver atrás destruye las firmas, pero NO los registros firmados: vuelven al
-- texto de reemplazo, que es el estado anterior a la 063. Antes de cualquier
-- despliegue, revertir es sencillamente no aplicarla.
