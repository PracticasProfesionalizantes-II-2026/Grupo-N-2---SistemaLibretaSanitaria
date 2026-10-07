-- ============================================================================
-- PetCloud — Migración 060: validar matrículas desde el panel, con auditoría
--
-- Hasta acá `license_validated` no tenía un solo camino de aplicación: la única
-- escritura del repo era `scripts/seed-demo.mjs`, con service role. No existía
-- RPC ni Server Action que la pusiera en true, así que una veterinaria que se
-- registraba quedaba en "cuenta en revisión" para siempre.
--
-- LO QUE ESTA COLUMNA HABILITA, PARA DIMENSIONAR LA GUARDA
--
-- Exactamente dos cosas, y las dos pesan: `is_validated_vet()` (008) es lo que
-- el trigger `enforce_signature_requires_license()` (009) exige para **firmar
-- un registro clínico**, y `vet_institutions_nearby()` (055) la pide para
-- mostrar a alguien como **guardia en el directorio público**. O sea que la
-- función de abajo es la llave de la firma clínica de toda la plataforma. De
-- ahí que empiece comprobando `is_platform_admin()` y que el actor nunca sea
-- un parámetro: sale de `auth.uid()`, igual que en `log_admin_action()` (046).
--
-- POR QUÉ HACE FALTA UN RPC Y NO ALCANZA CON UN UPDATE DEL ADMIN
--
-- `protect_vet_privileges()` (058) revierte `license_validated` **en silencio**
-- para todo `current_user` que no sea `service_role`/`postgres`/`supabase_admin`.
-- Un UPDATE con la sesión del admin devolvería éxito y no cambiaría nada: el
-- peor modo de fallar que hay. `SECURITY DEFINER` corre como el dueño de la
-- función, que está en esa lista, así que el RPC sí escribe.
--
-- POR QUÉ LA NOTA DE REVISIÓN NO VIVE EN `vet_professionals`
--
-- Porque la política de SELECT de esa tabla es `USING (true)` —abierta a
-- propósito desde la 001, y la 058 la dejó intacta para que
-- `is_institution_owner()` no recurse (005)—. Una nota de rechazo es texto
-- libre que un administrador escribe sobre una persona ("el documento está
-- ilegible", "el número no figura en el colegio"), y ahí adentro la leería
-- cualquier cuenta autenticada. Es el mismo criterio con el que la 041 dejó
-- `internal_notes` fuera de la proyección del dueño. La única columna que no
-- dice nada de nadie —cuándo se revisó— sí va en la tabla, porque de
-- `license_reviewed_at IS NULL` depende el filtro de pendientes del panel.
--
-- LO QUE ESTE CICLO NO HACE, Y ESTÁ ACEPTADO
--
-- No hay archivo de matrícula: ni columna, ni bucket, ni upload. El admin
-- aprueba contra el número y los datos del profesional, que es como se valida
-- hoy por fuera del sistema. La gestión de adjuntos es un ciclo propio —bucket,
-- RLS de Storage, tipos y tamaños, retención de un documento con datos
-- personales— y meterla acá de contrabando sería peor que no tenerla.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · La auditoría tiene que poder nombrar esta acción
--
-- `action` y `target_type` son CHECK cerrados (046). Extender un `IN` no puede
-- rechazar ninguna fila que hoy exista, así que esto no necesita backfill ni
-- ventana. Lo que sí hay que rehacer es el CHECK de pareja: el original ataba
-- `municipality_registered` a `target_type = 'municipality'` con una igualdad,
-- y esa forma no escala a un tercer par. Se reemplaza por una condición que
-- enumera los tres, de manera que agregar una acción mañana obligue a decir a
-- qué clase de objeto apunta en vez de dejarlo pasar.
-- ----------------------------------------------------------------------------
ALTER TABLE admin_action_log DROP CONSTRAINT admin_action_log_action_check;

ALTER TABLE admin_action_log ADD CONSTRAINT admin_action_log_action_check
  CHECK (action IN (
    'admin_granted', 'admin_revoked', 'account_suspended',
    'account_reactivated', 'municipality_registered',
    'vet_license_validated', 'vet_license_rejected'
  ));

ALTER TABLE admin_action_log DROP CONSTRAINT admin_action_log_target_type_check;

ALTER TABLE admin_action_log ADD CONSTRAINT admin_action_log_target_type_check
  CHECK (target_type IN ('profile', 'municipality', 'vet_professional'));

ALTER TABLE admin_action_log DROP CONSTRAINT admin_action_log_check;

ALTER TABLE admin_action_log ADD CONSTRAINT admin_action_log_action_target_check
  CHECK (
    CASE
      WHEN action = 'municipality_registered' THEN target_type = 'municipality'
      WHEN action IN ('vet_license_validated', 'vet_license_rejected')
        THEN target_type = 'vet_professional'
      ELSE target_type = 'profile'
    END
  );

-- ----------------------------------------------------------------------------
-- 2 · Cuándo se revisó
--
-- `license_reviewed_at IS NULL` es "todavía nadie lo miró", y es lo único que
-- distingue una solicitud pendiente de una rechazada: `license_validated` es
-- booleano y sin esto los dos estados son el mismo valor. Sin esta columna la
-- lista de pendientes del panel no se vacía nunca.
--
-- QUIEN REVISO NO VA EN ESTA TABLA, Y LA RAZON ES CONCRETA
--
-- Una segunda FK de `vet_professionals` hacia `profiles` rompe TODOS los
-- embeds `profiles(...)` de PostgREST contra esta tabla: con dos caminos
-- posibles deja de poder elegir, devuelve
-- "Could not embed because more than one relationship was found" y se lleva
-- puestos seis archivos del schema `erp` que hoy compilan. Se descubrio con el
-- typecheck en rojo, no en produccion, y la salida correcta no era poner hints
-- en el codigo ajeno: el revisor ya vive en
-- `vet_license_reviews.reviewer_profile_id`, con su FK y su ON DELETE SET NULL.
-- Tenerlo tambien aca era desnormalizacion que no hacia falta y una segunda
-- fuente de verdad de regalo. Aca queda solo la marca de tiempo, que es lo
-- unico que el filtro de pendientes necesita.
-- ----------------------------------------------------------------------------
ALTER TABLE vet_professionals
  ADD COLUMN license_reviewed_at TIMESTAMPTZ;

CREATE INDEX idx_vet_professionals_license_pendiente
  ON vet_professionals (created_at)
  WHERE license_reviewed_at IS NULL AND removed_at IS NULL;

-- BACKFILL: lo ya decidido no vuelve a la cola
--
-- Sin esto, el dia que esta migracion llega a produccion **toda veterinaria ya
-- validada aparece como pendiente**, porque la columna nace NULL y NULL es
-- "nadie la miro". El panel abriria con la cola llena de decisiones que ya se
-- habian tomado, y la primera impresion de la pantalla nueva seria que hay que
-- revisar de nuevo a todos. Se descubrio probando la pantalla en local, no
-- leyendo el diff.
--
-- Se sella con `now()` —el momento en que esta migracion corre— y no con
-- `created_at`: nadie reviso esa matricula el dia que se creo la ficha, y
-- escribir esa fecha seria inventar un dato de auditoria. `now()` dice lo unico
-- que se sabe con certeza: a partir de aca, no esta pendiente. Tampoco se crea
-- una fila en `vet_license_reviews`, porque no hubo revisor ni nota que
-- registrar y una auditoria con un revisor inventado es peor que un hueco.
UPDATE vet_professionals
SET license_reviewed_at = now()
WHERE license_validated;

COMMENT ON COLUMN vet_professionals.license_reviewed_at IS
  'Cuando un administrador de plataforma resolvio la solicitud, valide o '
  'rechace. NULL es "pendiente". Lo escribe solo admin_set_vet_license().';

-- ----------------------------------------------------------------------------
-- 3 · La nota, en su propia tabla y con su propia RLS
--
-- Una fila por decisión, no una por profesional: la historia de revisiones es
-- append-only y sirve para el caso real de "me rechazaron, corregí el número,
-- volví a pedir". El panel muestra la última; el profesional ve las suyas.
--
-- Sin políticas de INSERT/UPDATE/DELETE, igual que `admin_action_log` (046):
-- el único camino de escritura es el INSERT de adentro de la función de abajo,
-- que corre como el dueño de la tabla y saltea esta RLS por completo.
-- ----------------------------------------------------------------------------
CREATE TABLE vet_license_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES vet_professionals(id) ON DELETE CASCADE,
  reviewer_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  validated BOOLEAN NOT NULL,
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vet_license_reviews_profesional
  ON vet_license_reviews (professional_id, occurred_at DESC);

ALTER TABLE vet_license_reviews ENABLE ROW LEVEL SECURITY;

-- Dos ramas y no una: el administrador las lee todas porque el panel las
-- muestra, y el profesional lee las suyas porque de eso depende que se entere
-- de por que lo rechazaron. Nadie mas, ni el resto de su propia veterinaria:
-- el motivo del rechazo es entre la plataforma y esa persona.
CREATE POLICY "vet_license_reviews_select" ON vet_license_reviews FOR SELECT
  USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM vet_professionals vp
      WHERE vp.id = professional_id AND vp.profile_id = auth.uid()
    )
  );

COMMENT ON TABLE vet_license_reviews IS
  'Historial de decisiones sobre matriculas profesionales. Vive aparte de '
  'vet_professionals porque esa tabla tiene SELECT USING (true) y la nota de '
  'rechazo es texto libre sobre una persona.';

-- ----------------------------------------------------------------------------
-- 4 · Las dos columnas nuevas también se congelan
--
-- Sin esto, cerrar la escritura de `license_validated` no cierra nada: un
-- profesional con la política `vet_professionals_update_own` (058) podría
-- ponerse `license_reviewed_at = now()` y **desaparecer de la lista de
-- pendientes del panel** sin que nadie lo hubiera mirado. No se gana la
-- matrícula con eso, se gana no ser revisado, que a los fines prácticos es
-- peor: la solicitud queda enterrada.
--
-- Se restata el cuerpo entero de la 058 con dos guardas más. Es el cuarto
-- linaje de esta función (019 → 055 → 058 → 060) y se restata completa a
-- propósito: una función parcial obligaría a leer cuatro migraciones para
-- saber qué protege hoy.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_vet_privileges()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.license_validated IS DISTINCT FROM OLD.license_validated THEN
    NEW.license_validated := OLD.license_validated;
  END IF;

  IF OLD.license_validated
     AND NEW.license_number IS DISTINCT FROM OLD.license_number
  THEN
    NEW.license_number := OLD.license_number;
  END IF;

  IF NEW.role_in_institution IS DISTINCT FROM OLD.role_in_institution THEN
    NEW.role_in_institution := OLD.role_in_institution;
  END IF;

  IF NEW.on_call AND NOT NEW.license_validated THEN
    NEW.on_call := false;
  END IF;

  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    NEW.institution_id := OLD.institution_id;
  END IF;

  IF NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    NEW.removed_at := OLD.removed_at;
  END IF;

  -- Séptima (060): el sello de revisión lo escribe el panel, no el revisado.
  IF NEW.license_reviewed_at IS DISTINCT FROM OLD.license_reviewed_at THEN
    NEW.license_reviewed_at := OLD.license_reviewed_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION protect_vet_privileges IS
  'Impide que un profesional se cambie a si mismo la validacion de matricula, '
  'el numero ya validado, su rol, la guardia sin matricula, la institucion en '
  'la que trabaja, su propia baja, ni el sello de revision del panel. '
  'Restatada por la 060 sobre el cuerpo de la 058.';

-- ----------------------------------------------------------------------------
-- 5 · admin_set_vet_license
--
-- Valida o rechaza, deja el sello de revisión, escribe la nota y audita — todo
-- en una transacción. Partido en dos llamadas desde TS, un fallo en la segunda
-- dejaría una matrícula habilitada sin rastro de quién la habilitó, que es
-- exactamente lo que una auditoría existe para impedir.
--
-- LA BAJADA DE `on_call` NO ES UN DETALLE
--
-- Al desvalidar, el profesional que tenía guardia declarada quedaría anunciado
-- como guardia sin matrícula en el directorio público. El trigger ya contempla
-- ese caso, pero esta función está exenta del trigger —es su razón de ser—, así
-- que la guarda hay que repetirla acá a mano. Es la clase de consecuencia
-- lateral que se pierde justo cuando se saltea la protección.
--
-- `p_note` se guarda siempre que venga, valide o rechace: dejar dicho por qué
-- se aprobó también es trazabilidad. En `admin_action_log` NO viaja la nota,
-- solo si hubo: aquel historial lo lee cualquier administrador y el texto es
-- entre la plataforma y esa persona.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_set_vet_license(
  p_professional_id UUID,
  p_validated BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE (
  professional_id UUID,
  validated BOOLEAN,
  reviewed_at TIMESTAMPTZ
) AS $$
DECLARE
  v_nota TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_etiqueta TEXT;
  v_reviewed_at TIMESTAMPTZ := now();
  v_existe BOOLEAN;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Solo un administrador de plataforma puede resolver matrículas'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT TRUE,
         COALESCE(NULLIF(btrim(p.first_name || ' ' || p.last_name), ''), u.email)
           || ' · ' || vp.license_number
    INTO v_existe, v_etiqueta
  FROM vet_professionals vp
  JOIN profiles p ON p.id = vp.profile_id
  JOIN auth.users u ON u.id = vp.profile_id
  WHERE vp.id = p_professional_id;

  IF NOT COALESCE(v_existe, FALSE) THEN
    RAISE EXCEPTION 'El profesional % no existe', p_professional_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE vet_professionals
  SET license_validated = p_validated,
      license_reviewed_at = v_reviewed_at,
      -- Desvalidar y dejar la guardia anunciada seria anunciar como guardia a
      -- alguien sin matricula. El trigger lo cubre; esta funcion esta exenta.
      on_call = CASE WHEN p_validated THEN on_call ELSE FALSE END
  WHERE id = p_professional_id;

  INSERT INTO vet_license_reviews (
    professional_id, reviewer_profile_id, validated, note, occurred_at
  ) VALUES (
    p_professional_id, auth.uid(), p_validated, v_nota, v_reviewed_at
  );

  PERFORM log_admin_action(
    CASE WHEN p_validated THEN 'vet_license_validated' ELSE 'vet_license_rejected' END,
    'vet_professional',
    p_professional_id,
    v_etiqueta,
    jsonb_build_object('con_nota', v_nota IS NOT NULL)
  );

  RETURN QUERY SELECT p_professional_id, p_validated, v_reviewed_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION admin_set_vet_license(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_vet_license(UUID, BOOLEAN, TEXT) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION admin_set_vet_license(UUID, BOOLEAN, TEXT) FROM authenticated;
-- DROP FUNCTION IF EXISTS admin_set_vet_license(UUID, BOOLEAN, TEXT);
-- DROP TABLE IF EXISTS vet_license_reviews;
-- DROP INDEX IF EXISTS idx_vet_professionals_license_pendiente;
-- ALTER TABLE vet_professionals DROP COLUMN IF EXISTS license_reviewed_at;
-- (protect_vet_privileges queda con las siete guardas: revertirla a seis
--  reabriría el agujero del sello de revisión. Si hay que volver atrás de
--  verdad, restatá el cuerpo de la 058 a mano y sabé lo que estás haciendo.)
-- ALTER TABLE admin_action_log DROP CONSTRAINT admin_action_log_action_target_check;
-- ALTER TABLE admin_action_log ADD CONSTRAINT admin_action_log_check
--   CHECK ((action = 'municipality_registered') = (target_type = 'municipality'));
