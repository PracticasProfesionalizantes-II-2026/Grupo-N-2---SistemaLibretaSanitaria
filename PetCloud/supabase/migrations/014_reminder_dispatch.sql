-- 014 · Que un aviso automático se mande una sola vez
--
-- La Edge Function que despacha recordatorios puede correr dos veces el mismo
-- día: un reintento, un solape, alguien invocándola a mano para probar. Sin una
-- regla en la base, cada corrida vuelve a avisar lo mismo y el dueño recibe el
-- mismo correo tres veces.
--
-- ----------------------------------------------------------------------------
-- 1 · Un aviso automático siempre sabe de qué habla
--
-- El índice de deduplicación se apoya en `source_id` —el id de la vacuna o del
-- antiparasitario que vence— y en Postgres dos NULL no son iguales entre sí. Si
-- una fila automática llegara sin `source_id`, el índice la dejaría pasar
-- siempre y la deduplicación no fallaría: simplemente no haría nada, en
-- silencio, que es la peor forma de no funcionar.
--
-- Se cierra por construcción. Hoy no hay ninguna fila automática en la tabla
-- (se verificó antes de escribir esto), así que la restricción entra sin
-- excepciones que tolerar.
-- ----------------------------------------------------------------------------

ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_auto_needs_source;
ALTER TABLE reminders ADD CONSTRAINT reminders_auto_needs_source
  CHECK (source = 'manual' OR source_id IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 2 · Un aviso por cosa y por día
--
-- Se deduplica por `created_at`, no por `scheduled_at`, y la diferencia importa:
--
--   · `scheduled_at` guarda **de qué fecha se está hablando** — el día que vence
--     la dosis. Es lo que la pantalla de recordatorios ordena y muestra.
--   · `created_at` guarda **cuándo se avisó**.
--
-- Como el plan es avisar dos veces —una semana antes y el día del vencimiento—
-- deduplicar por `scheduled_at` habría bloqueado el segundo aviso: las dos
-- corridas hablan de la misma fecha de vencimiento. Deduplicar por el día en que
-- se avisa deja pasar los dos empujones y frena los repetidos.
--
-- `NULLS NOT DISTINCT` es cinturón sobre tirantes: la restricción de arriba ya
-- impide el `source_id` nulo, pero si algún día se relaja, el índice sigue
-- deduplicando en vez de volverse decorativo.
-- ----------------------------------------------------------------------------

-- La zona va escrita en el índice y no se toma de la sesión. Postgres exige que
-- la expresión sea IMMUTABLE, y `created_at::date` no lo es: el mismo instante
-- cae en un día u otro según el `TimeZone` de quien pregunte. Fijarla también
-- resuelve la pregunta de producto —"un aviso por día" es un día argentino, no
-- uno que cambia a las 21:00 hora local— en lugar de dejarla al azar del server.
DROP INDEX IF EXISTS idx_reminders_dedupe;
CREATE UNIQUE INDEX idx_reminders_dedupe
  ON reminders (
    pet_id,
    source,
    source_id,
    ((created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
  )
  NULLS NOT DISTINCT
  WHERE source != 'manual';

-- El despachador barre por estado y fecha; sin esto recorre la tabla entera.
CREATE INDEX IF NOT EXISTS idx_reminders_pendientes
  ON reminders (status, scheduled_at)
  WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- 3 · Cómo se quiere enterar cada persona
--
-- Los recordatorios manuales ya traen su propio `channel` por fila: son de quien
-- los creó y para cuándo los creó. Esto es otra cosa: la preferencia general
-- para los avisos que genera el sistema, que nadie pidió uno por uno.
--
-- Arrancan en `true` porque un recordatorio de vacunación es el motivo por el
-- que alguien se hace una cuenta en PetCloud. Apagarlos es una decisión que se
-- toma, no un estado por descubrir.
-- ----------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_email_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_push_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.notification_email_enabled IS
  'Preferencia para los avisos automáticos. Los recordatorios manuales llevan su propio channel por fila.';

-- No hacen falta políticas nuevas: `profiles` ya deja a cada uno leer y
-- actualizar su propia fila desde la 001, y estas dos columnas viajan con ella.
