-- ============================================================================
-- PetCloud — Migración 045: invitaciones de coautoría por email
--
-- Segunda mitad de las invitaciones de acceso compartido (044 solo agregó el
-- valor 'pet_access' al enum). Acá se resuelve el caso donde `sharePetAccess`
-- recibe un email que todavía no tiene cuenta en PetCloud: en vez de fallar,
-- se crea una invitación pendiente en `pet_share_invites`, keyed por
-- (pet_id, invited_email), y el ciclo de vida completo (aceptar/rechazar) se
-- resuelve del lado del invitado una vez que confirma su cuenta.
--
-- El invitado nunca tiene un UPDATE directo sobre esta tabla: todo cambio de
-- estado pasa por `accept_pet_share_invite()` / `decline_pet_share_invite()`,
-- ambas `SECURITY DEFINER`, que validan pendiente/no vencida/dirigida a su
-- propio email confirmado antes de tocar una fila. La política `_update` de
-- más abajo sigue existiendo para el dueño (por ejemplo, revocar o ajustar su
-- propia invitación desde el panel), pero el invitado no tiene ningún camino
-- directo.
--
-- `my_verified_email()` es el único punto de decisión de qué cuenta tiene qué
-- email confirmado — sin ella, una cuenta sin verificar podría reclamar una
-- invitación ajena. Devuelve NULL si el email no está confirmado, lo que en
-- la práctica vacía el brazo del invitado en la política de SELECT y
-- convierte accept/decline en no-ops.
--
-- `pet_name`/`inviter_name` quedan congelados en la fila: el invitado no
-- tiene SELECT sobre `pets` (política `pets_select` exige ser dueño o tener
-- acceso compartido, ninguno de los dos aplica todavía) ni sobre el
-- `profiles` de quien invita. Mismo criterio que
-- `campaign_qr_sessions.vaccine_name` (042).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- share_invite_status + pet_share_invites
-- ----------------------------------------------------------------------------
CREATE TYPE share_invite_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE pet_share_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL CHECK (invited_email = lower(invited_email)),
  permission share_permission NOT NULL DEFAULT 'view',
  status share_invite_status NOT NULL DEFAULT 'pending',
  pet_name TEXT NOT NULL,
  inviter_name TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pet_id, invited_email)
);

-- El UNIQUE de arriba ya indexa (pet_id, invited_email) en ese orden, pero
-- `invited_email` sola no queda cubierta como prefijo — y es exactamente la
-- columna que filtran la política de SELECT del invitado y ambas funciones de
-- accept/decline. `pet_id` se indexa aparte para las lecturas del dueño
-- (listar invitaciones pendientes de una mascota) sin depender del orden del
-- compuesto.
CREATE INDEX idx_pet_share_invites_invited_email ON pet_share_invites(invited_email);
CREATE INDEX idx_pet_share_invites_pet ON pet_share_invites(pet_id);

CREATE TRIGGER pet_share_invites_updated_at
  BEFORE UPDATE ON pet_share_invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- my_verified_email — el único punto de decisión de "email confirmado"
--
-- Va antes de las políticas de RLS a propósito: la de SELECT de acá abajo la
-- llama en su condición, y Postgres exige que la función ya exista al crear
-- la política, no solo al evaluarla.
--
-- NULL cuando la dirección no está confirmada: tanto el brazo del invitado en
-- la política de SELECT como las dos funciones de más abajo dejan de
-- matchear nada. `SECURITY DEFINER` porque un usuario autenticado común no
-- tiene SELECT sobre `auth.users` — mismo patrón ya usado en
-- `municipality_census_record` (022:235) y `is_validated_municipality`
-- (023:189) para leer esa tabla desde adentro de una función definer.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION my_verified_email()
RETURNS TEXT AS $$
  SELECT lower(u.email) FROM auth.users u
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================================
-- ROW LEVEL SECURITY — pet_share_invites
-- ============================================================================

ALTER TABLE pet_share_invites ENABLE ROW LEVEL SECURITY;

-- Nunca FORCE ROW LEVEL SECURITY — mismo motivo que 017/024/025/042: las
-- funciones `SECURITY DEFINER` de más abajo necesitan que el dueño de la
-- tabla quede exento de su propia RLS.

CREATE POLICY "pet_share_invites_select" ON pet_share_invites FOR SELECT
  USING (
    is_pet_owner(pet_id)
    OR (status = 'pending' AND expires_at > now()
        AND invited_email = my_verified_email())
  );

CREATE POLICY "pet_share_invites_insert" ON pet_share_invites FOR INSERT
  WITH CHECK (is_pet_owner(pet_id) AND invited_by = auth.uid() AND status = 'pending');

-- `USING`/`WITH CHECK` coinciden a propósito (misma regla que 041/042/043):
-- ningún UPDATE puede hacer que una fila "se mude" a otra mascota o a otro
-- invitador en el mismo golpe. El invitado no tiene ningún camino de UPDATE
-- directo acá — solo llega a cambiar el estado vía
-- `accept_pet_share_invite()` / `decline_pet_share_invite()`, ambas
-- `SECURITY DEFINER`, que no pasan por esta política.
CREATE POLICY "pet_share_invites_update" ON pet_share_invites FOR UPDATE
  USING (is_pet_owner(pet_id))
  WITH CHECK (is_pet_owner(pet_id) AND invited_by = auth.uid() AND status = 'pending');

CREATE POLICY "pet_share_invites_delete" ON pet_share_invites FOR DELETE
  USING (is_pet_owner(pet_id));

-- ----------------------------------------------------------------------------
-- accept_pet_share_invite — el único camino de escritura que tiene el
-- invitado
--
-- `SECURITY DEFINER` porque el invitado no tiene ninguna política de INSERT
-- sobre `pet_shared_access` (`shared_access_insert`, 005, exige
-- `is_pet_owner`) ni de UPDATE sobre `pet_share_invites` (arriba). El
-- `SELECT ... FOR UPDATE` bloquea la fila mientras se decide, para que un
-- doble llamado concurrente al mismo invite no pueda colar dos accesos.
--
-- `ON CONFLICT ... WHERE pet_shared_access.permission < EXCLUDED.permission`
-- es la misma cláusula que decide design.md ("Accept vs existing access"):
-- aceptar una invitación con permiso 'view' nunca puede degradar a alguien
-- que ya es 'owner' o 'edit' de esa mascota. Si el UPSERT no corre por no
-- cumplir el WHERE, el accept igual se considera exitoso — el invitado ya
-- tenía acceso igual o mayor.
--
-- Devuelve el `pet_id` cuando todo sale bien, y NULL cuando la invitación no
-- existe, ya venció, ya fue respondida, o no está dirigida al email
-- confirmado de quien llama — un solo valor de salida, sin distinguir el
-- motivo, para no filtrarle a quien acepta cuál fue el problema puntual.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_pet_share_invite(p_invite_id UUID)
RETURNS UUID AS $$
DECLARE
  v_pet_id UUID;
  v_permission share_permission;
BEGIN
  SELECT pet_id, permission INTO v_pet_id, v_permission
  FROM pet_share_invites
  WHERE id = p_invite_id
    AND status = 'pending'
    AND expires_at > now()
    AND invited_email = my_verified_email()
  FOR UPDATE;

  IF v_pet_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO pet_shared_access (pet_id, shared_with_id, permission)
  VALUES (v_pet_id, auth.uid(), v_permission)
  ON CONFLICT (pet_id, shared_with_id) DO UPDATE
    SET permission = EXCLUDED.permission
  WHERE pet_shared_access.permission < EXCLUDED.permission;

  UPDATE pet_share_invites
  SET status = 'accepted', responded_at = now()
  WHERE id = p_invite_id;

  RETURN v_pet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- decline_pet_share_invite — misma validación que accept, sin tocar
-- `pet_shared_access`. Devuelve `true` solo si de verdad marcó una fila;
-- `false` cubre exactamente los mismos casos que el NULL de accept (invitación
-- inexistente, vencida, ya respondida, o de otro email).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decline_pet_share_invite(p_invite_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE pet_share_invites
  SET status = 'declined', responded_at = now()
  WHERE id = p_invite_id
    AND status = 'pending'
    AND expires_at > now()
    AND invited_email = my_verified_email();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION accept_pet_share_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_pet_share_invite(UUID) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION decline_pet_share_invite(UUID) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION accept_pet_share_invite(UUID) FROM authenticated;
-- DROP FUNCTION IF EXISTS decline_pet_share_invite(UUID);
-- DROP FUNCTION IF EXISTS accept_pet_share_invite(UUID);
-- DROP FUNCTION IF EXISTS my_verified_email();
-- DROP POLICY IF EXISTS "pet_share_invites_delete" ON pet_share_invites;
-- DROP POLICY IF EXISTS "pet_share_invites_update" ON pet_share_invites;
-- DROP POLICY IF EXISTS "pet_share_invites_insert" ON pet_share_invites;
-- DROP POLICY IF EXISTS "pet_share_invites_select" ON pet_share_invites;
-- DROP TRIGGER IF EXISTS pet_share_invites_updated_at ON pet_share_invites;
-- DROP INDEX IF EXISTS idx_pet_share_invites_pet;
-- DROP INDEX IF EXISTS idx_pet_share_invites_invited_email;
-- DROP TABLE IF EXISTS pet_share_invites CASCADE;
-- DROP TYPE IF EXISTS share_invite_status;
--
-- Adición pura: ninguna fila preexistente depende de esta tabla ni de estas
-- funciones. El valor 'pet_access' de `notification_type` (044) no se toca
-- acá — no hay DROP VALUE, así que las filas `notifications.type='pet_access'`
-- ya emitidas quedan intactas y los mapas `TIPO_NOTIF`/`ICONS` del lado de la
-- app deben seguir reconociendo el valor para que sigan siendo renderizables.
