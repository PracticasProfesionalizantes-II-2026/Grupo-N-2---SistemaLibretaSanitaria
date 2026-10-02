-- ============================================================================
-- PetCloud — Migración 040: suscripción Premium de la veterinaria
--
-- El estado premium de una institución NO es una columna en
-- `vet_institutions`: esa tabla no tiene `WITH CHECK` en su política de
-- UPDATE (005:117-119), así que agregarle un campo escribible sería
-- reabrir la puerta que la 019 tuvo que cerrar con un trigger para
-- `role_in_institution`. Acá la tabla nueva es la que resuelve el problema
-- de raíz: `vet_subscriptions` **no tiene ninguna política de INSERT,
-- UPDATE ni DELETE para `authenticated`**. Solo la service role (webhook de
-- Mercado Pago + alta de checkout) puede escribirla. Con RLS en default-deny
-- no hace falta el trigger de la 019: no hay ninguna política autenticada
-- que compensar. Si alguna vez se agrega una, ese trigger pasa a ser
-- obligatorio — dejarlo dicho acá para quien lo lea después.
--
-- `institution_has_premium()` es la única fuente de verdad de "¿esta
-- institución tiene Premium ahora?": la consultan la política de
-- `appointments` (041), `requirePremiumVet()` del lado de la aplicación
-- (fase 5) y nada más. Nadie duplica esta lógica en otro lado.
-- ============================================================================

-- ¿Pertenece a esta institución, sin importar el rol? Distinta de
-- `is_institution_owner()` (005), que exige específicamente
-- `role_in_institution = 'owner'`. Esta la necesita cualquier miembro para
-- leer el estado de la suscripción de su propia veterinaria.
CREATE OR REPLACE FUNCTION is_institution_member(p_institution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vet_professionals
    WHERE institution_id = p_institution_id AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- vet_subscriptions
--
-- `amount_cents`/`currency` son una copia congelada del precio contratado
-- (regla de no retroactividad), no una referencia que se resuelve leyendo
-- `premium_prices` cada vez. `provider_updated_at` guarda contra eventos de
-- webhook fuera de orden (ver 040→`subscription-webhook.ts` en fase 4): un
-- evento viejo nunca puede pisar un estado ya confirmado por uno más nuevo.
-- ----------------------------------------------------------------------------
CREATE TABLE vet_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL UNIQUE REFERENCES vet_institutions(id) ON DELETE CASCADE,
  price_id UUID NOT NULL REFERENCES premium_prices(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'past_due', 'cancelled', 'rejected')),
  provider TEXT NOT NULL DEFAULT 'mercadopago' CHECK (provider IN ('mercadopago')),
  provider_subscription_id TEXT UNIQUE,
  provider_updated_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  grace_until TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vet_subscriptions_institution ON vet_subscriptions(institution_id);

CREATE TRIGGER vet_subscriptions_updated_at
  BEFORE UPDATE ON vet_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE vet_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vet_subscriptions_select" ON vet_subscriptions FOR SELECT
  USING (is_institution_member(institution_id) OR is_platform_admin());

-- Sin INSERT/UPDATE/DELETE: el estado premium solo lo escribe la service
-- role (webhook + alta de checkout, ambos con `createAdminClient()`). Esto
-- reemplaza al patrón trigger-guard de la 019: acá no hace falta un trigger
-- que revierta un cambio porque no existe ninguna política que permita
-- intentarlo en primer lugar.

-- ----------------------------------------------------------------------------
-- vet_subscription_events
--
-- Registro de cada notificación de Mercado Pago, con `UNIQUE (provider,
-- provider_event_id)` como mecanismo real de idempotencia: un `INSERT`
-- duplicado choca con `23505` y el handler del webhook (fase 4) lo toma como
-- señal de "ya procesado", sin volver a aplicar ningún efecto.
-- ----------------------------------------------------------------------------
CREATE TABLE vet_subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'mercadopago' CHECK (provider IN ('mercadopago')),
  provider_event_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  subscription_id UUID REFERENCES vet_subscriptions(id) ON DELETE SET NULL,
  provider_status TEXT,
  occurred_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX idx_subscription_events_sub
  ON vet_subscription_events(subscription_id, received_at DESC);

ALTER TABLE vet_subscription_events ENABLE ROW LEVEL SECURITY;

-- Solo backoffice: el payload trae datos del pagador que la veterinaria no
-- necesita ver.
CREATE POLICY "subscription_events_select" ON vet_subscription_events FOR SELECT
  USING (is_platform_admin());

-- ----------------------------------------------------------------------------
-- institution_has_premium
--
-- Tres condiciones, una por estado que da acceso: autorizada y dentro del
-- período pagado; en mora pero todavía dentro de los 7 días de gracia
-- (`grace_until`); cancelada pero el período ya pagado no terminó. Fuera de
-- esas tres, no hay premium — ni siquiera si `status` fuera 'authorized' con
-- el período ya vencido (webhook que todavía no llegó a actualizarlo).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION institution_has_premium(p_institution_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vet_subscriptions s
    WHERE s.institution_id = p_institution_id
      AND (
        (s.status = 'authorized'
           AND (s.current_period_end IS NULL OR now() <= s.current_period_end))
        OR (s.status = 'past_due'
           AND s.grace_until IS NOT NULL AND now() <= s.grace_until)
        OR (s.status = 'cancelled'
           AND s.current_period_end IS NOT NULL AND now() <= s.current_period_end)
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS institution_has_premium(UUID);
-- DROP TABLE IF EXISTS vet_subscription_events;
-- DROP TABLE IF EXISTS vet_subscriptions;
-- DROP FUNCTION IF EXISTS is_institution_member(UUID);
