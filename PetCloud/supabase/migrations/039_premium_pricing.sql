-- ============================================================================
-- PetCloud — Migración 039: precio de Premium para veterinarias
--
-- Primera pieza de "Premium para veterinarias" (suscripción Mercado Pago +
-- Turnos). El precio vigente vive en `premium_prices`, una tabla de solo
-- alta: cada cambio de precio agrega una fila nueva, nunca reescribe una
-- existente. Eso hace estructural la regla de negocio "los cambios de precio
-- no son retroactivos" — una suscripción ya activa queda atada al `id` de la
-- fila con la que se contrató (`vet_subscriptions.price_id`, migración 040),
-- así que no hay forma de que un `UPDATE` posterior le cambie el monto.
--
-- El dinero se guarda en centavos (`amount_cents BIGINT`), no en `NUMERIC`:
-- es la primera plata que maneja el esquema en 38 migraciones, así que la
-- convención se fija acá. Un entero de unidad mínima no tiene drift de
-- redondeo; Mercado Pago espera pesos, así que la conversión
-- (`centsToMpAmount`) pasa por `src/lib/money.ts` y ocurre solo en el borde
-- con la API externa, nunca en la base.
--
-- `is_platform_admin()` es la primera función que distingue el rol `admin`
-- del enum `user_role` (001) para RLS: hasta ahora ningún backoffice propio
-- necesitaba esa distinción.
-- ============================================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ----------------------------------------------------------------------------
-- premium_prices
--
-- `effective_from DESC` es el criterio de "vigente": la fila con la fecha más
-- reciente es el precio actual. `mp_preapproval_plan_id` lo completa la
-- service role la primera vez que alguien se suscribe a ese precio (creación
-- perezosa del plan en Mercado Pago, ver diseño D4) — por eso no tiene
-- política de UPDATE.
-- ----------------------------------------------------------------------------
CREATE TABLE premium_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS')),
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly')),
  mp_preapproval_plan_id TEXT UNIQUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_premium_prices_vigente ON premium_prices (effective_from DESC);

ALTER TABLE premium_prices ENABLE ROW LEVEL SECURITY;

-- Es un precio de lista publicado: cualquier veterinaria tiene que poder
-- leerlo antes de decidir si suscribirse. El historial completo no expone
-- datos de nadie, así que tampoco hace falta filtrarlo.
CREATE POLICY "premium_prices_select" ON premium_prices FOR SELECT
  USING (true);

CREATE POLICY "premium_prices_insert" ON premium_prices FOR INSERT
  WITH CHECK (is_platform_admin() AND created_by = auth.uid());

-- Sin UPDATE ni DELETE a propósito: el historial no se reescribe, se agrega.
-- Es la misma técnica que ya usa `notifications` (002) sin política de
-- INSERT: la ausencia de la política es la regla, no un olvido.

-- ROLLBACK
-- DROP TABLE IF EXISTS premium_prices;
-- DROP FUNCTION IF EXISTS is_platform_admin();
