-- ============================================================================
-- PetCloud — Migración 050: estado antirrábico para la ficha pública del collar
--
-- Quien escanea una chapita en la calle —porque encontró al animal, o porque el
-- animal acaba de morder a alguien— necesita una sola respuesta sanitaria: si
-- la antirrábica está al día. Esta función la da, y **nada más que eso**.
--
-- Devuelve uno de cuatro textos: 'al-dia', 'por-vencer', 'vencida',
-- 'sin-datos'. No devuelve el nombre de la vacuna, ni la fecha de aplicación,
-- ni la de vencimiento, ni quién la firmó. El dato que no puede aparecer no se
-- lee: la función no expone filas, expone un veredicto.
--
-- ----------------------------------------------------------------------------
-- 1 · Por qué SECURITY INVOKER, al revés que las nueve funciones municipales
-- ----------------------------------------------------------------------------
--
-- Esta es la decisión de seguridad del cambio, y es contraintuitiva.
--
-- El reflejo sería `SECURITY DEFINER`, como hacen las funciones del padrón
-- (038). Acá sería un agujero. El motivo está documentado en `046:121-128`:
-- **ambos entornos terminan otorgando `EXECUTE ON ALL FUNCTIONS IN SCHEMA
-- public` a `anon` y `authenticated`** — producción por default privileges, y
-- `supabase/seed.sql:24` en local, a propósito, para imitarla. La línea 32 de
-- ese mismo archivo extiende el privilegio a las funciones **futuras**, así que
-- toda función nueva nace ejecutable por `anon`.
--
-- Bajo esa realidad:
--
--   · `SECURITY DEFINER` correría el cuerpo como dueño de la tabla, salteando
--     RLS. Cualquiera con la anon key podría pedir el estado sanitario de
--     CUALQUIER mascota pasando un `pet_id` — sin resolver ningún QR, sin
--     tener nada. Un padrón sanitario consultable por id.
--
--   · `SECURITY INVOKER` hace que ese GRANT masivo quede **inerte**. El cuerpo
--     corre con los privilegios de quien llama, y RLS le esconde a `anon` todas
--     las filas de `vaccinations` (`vaccinations_select` exige
--     `has_pet_access`, que con `auth.uid()` NULL nunca da true). La
--     subconsulta no devuelve fila y el COALESCE contesta 'sin-datos'. RLS
--     termina haciendo de aserción de rol, que es lo que
--     `docs/decisiones/rls-es-la-frontera-de-seguridad.md` exige de toda
--     `SECURITY DEFINER` con GRANT.
--
--     **Ojo con cómo se verifica esto, porque la intuición falla.** No tira
--     error de permisos: el mismo seed que otorga EXECUTE otorga también
--     `GRANT ALL ON ALL TABLES` (`seed.sql:22`), así que `anon` sí puede hacer
--     SELECT sobre `vaccinations` — lo que no puede es ver una sola fila.
--     Probado a mano contra este stack, con EXECUTE otorgado a `anon` y una
--     dosis verificada vigente cargada: `postgres` obtiene 'al-dia' y `anon`
--     obtiene 'sin-datos'. Quien vaya a comprobar que "falla" va a ver que no
--     falla y puede concluir, equivocándose, que la protección no existe.
--
--     Que conteste 'sin-datos' en vez de fallar es además lo correcto para la
--     privacidad: desde afuera, "no tengo permiso" y "esta mascota no tiene
--     dosis cargada" son indistinguibles. No hay oráculo.
--
-- Quien sí la llama es la ficha pública, servida con `createAdminClient()`
-- (service role), que saltea RLS por sí solo y ya tiene los GRANT de tabla. No
-- necesita que esta función sea DEFINER: le alcanza con ser quien es.
--
-- `SECURITY INVOKER` es el default de Postgres. Se escribe igual, explícito,
-- porque acá es una decisión deliberada y contraria al resto del repo — y lo
-- que no está escrito se "corrige" al primer vistazo.
--
-- ----------------------------------------------------------------------------
-- 2 · Por qué el REVOKE no es la barrera
-- ----------------------------------------------------------------------------
--
-- El `REVOKE` de más abajo es defensa en profundidad y nada más: el seed local
-- vuelve a abrir el permiso en el próximo `db reset`, y en producción lo hacen
-- los default privileges. Si la seguridad de esto dependiera del REVOKE,
-- dependería de algo que el propio proyecto revierte solo. Depende del INVOKER.
--
-- El `GRANT ... TO service_role` sí importa, pero como documentación ejecutable:
-- nombra al único llamador previsto en vez de apoyarse en los privilegios que
-- cada entorno traiga puestos.
--
-- ----------------------------------------------------------------------------
-- 3 · Una sola clasificación de "es antirrábica"
-- ----------------------------------------------------------------------------
--
-- `vaccine_name` es texto libre: no hay enum, no hay catálogo, no hay FK. La
-- única clasificación que existe es la heurística que ya corre en producción
-- para el padrón (038): `unaccent(vaccine_name) ILIKE '%rabi%'`.
--
-- Se reusa tal cual, y no se reimplementa en TypeScript, por dos razones. La
-- primera es que ya mordió una vez: **sin `unaccent`, `ILIKE '%rabi%'` NO
-- matchea "Antirrábica"** — la tilde parte la subcadena, y la grafía correcta
-- daba 'sin-datos' (022:44-48). La segunda es que una segunda copia de una
-- heurística imprecisa garantiza que algún día el padrón y el collar digan
-- cosas distintas de la misma mascota.
--
-- Es imprecisa a propósito: matchea "Antirrábica", "Antirrabica" y "Rabia", y
-- también cualquier otra cosa que contenga "rabi". Un catálogo real es otro
-- cambio.
--
-- ----------------------------------------------------------------------------
-- 4 · Solo dosis verificadas, y por qué eso es el producto
-- ----------------------------------------------------------------------------
--
-- `v.verified` no es un filtro de calidad: es la regla. Una dosis que cargó el
-- dueño de memoria le sirve a él y no vale como certificado ante un tercero.
-- Sin este filtro, la chapita le certificaría a la persona mordida algo que
-- escribió la parte interesada.
--
-- El costo está aceptado por escrito en el proposal: una mascota realmente
-- vacunada cuya dosis cargó el dueño va a mostrar 'sin-datos', y eso puede
-- mandar a alguien a una consulta que no hacía falta. Es la dirección correcta
-- del error — la inversa, un 'al-dia' autodeclarado que convence a alguien de
-- no tratarse, no se recupera.
--
-- ----------------------------------------------------------------------------
-- 5 · Qué NO hace esta migración
-- ----------------------------------------------------------------------------
--
-- No crea ni altera ninguna tabla, columna, índice, enum ni política. No otorga
-- nada a `anon`. No escribe una sola fila. El estado se deriva en cada llamada
-- —regla vigente en `docs/reglas-negocio.md`, "el estado sanitario se deriva,
-- nunca se guarda"— porque una columna guardada diría 'al-dia' sobre una dosis
-- que venció ayer, sin que nadie haya tocado nada.
--
-- El índice que necesita ya existe: `idx_vaccinations_pet_verified_rabia`
-- `(pet_id, applied_at DESC) WHERE verified`, creado por la 022 justo para esta
-- consulta.
--
-- Rollback: DROP FUNCTION public_rabies_status(UUID);
-- ============================================================================

CREATE OR REPLACE FUNCTION public_rabies_status(p_pet_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- El COALESCE exterior es el que garantiza que nunca salga NULL: sin dosis
  -- que matchee, la subconsulta no devuelve fila y el estado es 'sin-datos'.
  -- Que la ausencia de datos tenga nombre propio es el punto de toda la
  -- función: 'al-dia' sobre cero evidencia es la peor respuesta posible acá.
  SELECT COALESCE(
    (SELECT CASE
       -- Mismos cortes que el padrón (038), al día exacto: el día del
       -- vencimiento todavía cuenta como 'por-vencer', no como 'vencida'.
       WHEN (COALESCE(v.next_dose_at, v.applied_at + INTERVAL '1 year'))::date
            < CURRENT_DATE THEN 'vencida'
       WHEN (COALESCE(v.next_dose_at, v.applied_at + INTERVAL '1 year'))::date
            <= CURRENT_DATE + INTERVAL '30 days' THEN 'por-vencer'
       ELSE 'al-dia'
     END
     FROM vaccinations v
     WHERE v.pet_id = p_pet_id
       AND v.verified
       AND unaccent(v.vaccine_name) ILIKE '%rabi%'
     -- La última aplicada manda. Sin desempate, igual que 038: dos dosis
     -- verificadas el mismo día es el único caso ambiguo, y divergir del padrón
     -- ahí significaría que el censo y el collar discrepen sobre la misma
     -- mascota.
     ORDER BY v.applied_at DESC
     LIMIT 1),
    'sin-datos');
$$;

REVOKE EXECUTE ON FUNCTION public_rabies_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public_rabies_status(UUID) TO service_role;

COMMENT ON FUNCTION public_rabies_status IS
  'Estado antirrábico para la ficha pública del collar: al-dia | por-vencer | '
  'vencida | sin-datos. Solo dosis verificadas por un veterinario. '
  'SECURITY INVOKER a propósito: ambos entornos otorgan EXECUTE sobre todas '
  'las funciones a anon (046), y correr el cuerpo como quien llama es lo que '
  'deja ese grant inerte — anon no tiene privilegio sobre vaccinations. Un '
  'SECURITY DEFINER acá sería un padrón sanitario consultable por pet_id.';
