-- ============================================================================
-- 073 — Solicitudes de acceso a mascotas por dirección compartida
-- ============================================================================
-- Un usuario que vive en la misma casa que otro dueño puede pedirle acceso a
-- sus mascotas. El dueño decide: hasta que acepta, el solicitante no ve nada
-- de las mascotas ni del dueño — solo cuántas mascotas hay en su dirección.
--
-- Privacidad: ninguna función recibe una dirección por parámetro. Todas usan
-- la `address_normalized` del perfil de `auth.uid()`. Si recibieran una
-- dirección libre, cualquier usuario podría probar domicilios ajenos y saber
-- en cuáles hay mascotas (oráculo de enumeración). Así, para consultar otra
-- dirección tendría que declararla como propia en su perfil.
--
-- `profiles.address` es texto libre no verificado: la aprobación del dueño es
-- el único control real. Por eso el solicitante nunca recibe datos antes.
--
-- "Mascotas de un dueño" = `pets.owner_id` o una fila `permission = 'owner'`
-- en `pet_shared_access` (modelo N:N de la 035).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Normalización de direcciones
-- ----------------------------------------------------------------------------
-- `translate` en vez de la extensión `unaccent`: no agrega una dependencia y
-- es IMMUTABLE, así que sirve en índices. Devuelve NULL para texto vacío.
CREATE OR REPLACE FUNCTION normalize_address(p_text TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          translate(
            lower(p_text),
            'áàäâãéèëêíìïîóòöôõúùüûñç',
            'aaaaaeeeeiiiiooooouuuunc'
          ),
          '[^a-z0-9 ]', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_normalized TEXT;

CREATE OR REPLACE FUNCTION profiles_set_address_normalized()
RETURNS TRIGGER AS $$
BEGIN
  NEW.address_normalized := normalize_address(NEW.address);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_address_normalized ON profiles;
CREATE TRIGGER profiles_address_normalized
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_set_address_normalized();

UPDATE profiles SET address_normalized = normalize_address(address);

CREATE INDEX IF NOT EXISTS idx_profiles_address_normalized
  ON profiles(address_normalized) WHERE address_normalized IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Cuántas mascotas hay en mi dirección (solo el número)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_matching_pets_by_address()
RETURNS JSONB AS $$
DECLARE
  v_address TEXT;
  v_count INTEGER;
BEGIN
  SELECT address_normalized INTO v_address
  FROM profiles WHERE id = auth.uid();

  IF v_address IS NULL THEN
    RETURN jsonb_build_object('matching_pets_count', 0);
  END IF;

  -- DISTINCT: una mascota con dos dueños en la misma casa se cuenta una vez.
  SELECT count(DISTINCT p.id) INTO v_count
  FROM profiles pr
  JOIN pets p ON p.owner_id = pr.id
    OR EXISTS (
      SELECT 1 FROM pet_shared_access psa
      WHERE psa.pet_id = p.id AND psa.shared_with_id = pr.id
        AND psa.permission = 'owner'
    )
  WHERE pr.address_normalized = v_address
    AND pr.id <> auth.uid();

  RETURN jsonb_build_object('matching_pets_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- 3. Tabla de solicitudes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pet_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> target_owner_id)
);

-- Una sola pendiente por par; las resueltas quedan como historial y no
-- impiden volver a pedir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pet_access_requests_pending
  ON pet_access_requests(requester_id, target_owner_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pet_access_requests_target
  ON pet_access_requests(target_owner_id, status);

DROP TRIGGER IF EXISTS pet_access_requests_updated_at ON pet_access_requests;
CREATE TRIGGER pet_access_requests_updated_at
  BEFORE UPDATE ON pet_access_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pet_access_requests ENABLE ROW LEVEL SECURITY;

-- Solo lectura. No hay políticas de INSERT/UPDATE/DELETE: todo cambio pasa
-- por las RPC de abajo, que validan dirección, dueño y estado.
DROP POLICY IF EXISTS "pet_access_requests_select" ON pet_access_requests;
CREATE POLICY "pet_access_requests_select" ON pet_access_requests FOR SELECT
  USING (requester_id = auth.uid() OR target_owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. Crear solicitudes a los dueños de mi dirección
-- ----------------------------------------------------------------------------
-- Devuelve cuántas solicitudes nuevas se crearon. Solo apunta a dueños con al
-- menos una mascota: pedirle acceso a alguien sin mascotas no tiene sentido.
CREATE OR REPLACE FUNCTION create_pet_access_request_by_address()
RETURNS INTEGER AS $$
DECLARE
  v_address TEXT;
  v_created INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT address_normalized INTO v_address
  FROM profiles WHERE id = auth.uid();

  IF v_address IS NULL THEN
    RETURN 0;
  END IF;

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
    DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 5. Responder una solicitud
-- ----------------------------------------------------------------------------
-- `FOR UPDATE` bloquea la fila: dos respuestas concurrentes no pueden aplicar
-- dos veces. El UPSERT nunca degrada un permiso existente más alto (misma
-- regla que `accept_pet_share_invite` en la 045). Devuelve FALSE si la
-- solicitud no existe, no es del usuario o ya fue respondida.
CREATE OR REPLACE FUNCTION respond_pet_access_request(
  p_request_id UUID,
  p_accept BOOLEAN,
  p_permission share_permission DEFAULT 'view'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_request pet_access_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM pet_access_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_request.target_owner_id IS DISTINCT FROM auth.uid()
     OR v_request.status <> 'pending'
     OR p_accept IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_accept THEN
    INSERT INTO pet_shared_access (pet_id, shared_with_id, permission)
    SELECT p.id, v_request.requester_id, COALESCE(p_permission, 'view')
    FROM pets p
    WHERE p.owner_id = v_request.target_owner_id
       OR EXISTS (
         SELECT 1 FROM pet_shared_access psa
         WHERE psa.pet_id = p.id
           AND psa.shared_with_id = v_request.target_owner_id
           AND psa.permission = 'owner'
       )
    ON CONFLICT (pet_id, shared_with_id) DO UPDATE
      SET permission = EXCLUDED.permission
    WHERE pet_shared_access.permission < EXCLUDED.permission;

    UPDATE pet_access_requests SET status = 'accepted' WHERE id = p_request_id;
  ELSE
    UPDATE pet_access_requests SET status = 'declined' WHERE id = p_request_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- Permisos de ejecución: solo usuarios autenticados.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION check_matching_pets_by_address() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_pet_access_request_by_address() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION respond_pet_access_request(UUID, BOOLEAN, share_permission) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION check_matching_pets_by_address() TO authenticated;
GRANT EXECUTE ON FUNCTION create_pet_access_request_by_address() TO authenticated;
GRANT EXECUTE ON FUNCTION respond_pet_access_request(UUID, BOOLEAN, share_permission) TO authenticated;

-- ----------------------------------------------------------------------------
-- Rollback
-- ----------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS respond_pet_access_request(UUID, BOOLEAN, share_permission);
-- DROP FUNCTION IF EXISTS create_pet_access_request_by_address();
-- DROP FUNCTION IF EXISTS check_matching_pets_by_address();
-- DROP TABLE IF EXISTS pet_access_requests;
-- DROP TRIGGER IF EXISTS profiles_address_normalized ON profiles;
-- DROP FUNCTION IF EXISTS profiles_set_address_normalized();
-- ALTER TABLE profiles DROP COLUMN IF EXISTS address_normalized;
-- DROP FUNCTION IF EXISTS normalize_address(TEXT);
