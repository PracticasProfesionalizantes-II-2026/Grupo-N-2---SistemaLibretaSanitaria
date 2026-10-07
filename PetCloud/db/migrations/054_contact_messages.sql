-- ============================================================================
-- PetCloud — Migración 054: los mensajes del formulario público existen
--
-- Hasta hoy el formulario de contacto del sitio público era una animación:
-- `contact-form.tsx:47-49` esperaba 700 ms con un `setTimeout` y mostraba
-- "Recibimos tu mensaje". No había destino. El panel de administración, del
-- otro lado, leía cinco tickets inventados de `admin/content/support.ts`. Las
-- dos mitades eran coherentes entre sí y falsas por igual: nadie podía notar
-- que los mensajes se perdían, porque el backoffice tenía con qué llenar la
-- pantalla.
--
-- Esta migración crea el único destino real: `contact_messages`.
--
-- ----------------------------------------------------------------------------
-- Por qué NO es una función SECURITY DEFINER
-- ----------------------------------------------------------------------------
--
-- La tentación es obvia: una `submit_contact_message()` definer, invocada con
-- la anon key, y la tabla cerrada a cal y canto. Está descartada, y el motivo
-- es el mismo que la 050 dejó escrito y que
-- `docs/decisiones/la-ficha-del-collar-no-pasa-por-rls.md` documenta: los dos
-- entornos otorgan `EXECUTE ON ALL FUNCTIONS` a `anon` —`seed.sql:24` acá,
-- default privileges en la nube—, así que **una SECURITY DEFINER nueva nace
-- invocable por cualquiera con la anon key**. No cierra nada: mueve la
-- superficie de una tabla con RLS a un cuerpo plpgsql sin RLS, que es peor,
-- porque lo que protege a ese cuerpo deja de ser declarativo.
--
-- Acá la pregunta que hay que contestar sí es la que RLS sabe contestar —
-- "¿quién puede escribir esta fila y quién puede leerla?"— así que la respuesta
-- es un INSERT directo acotado por una política, y nada más.
--
-- ----------------------------------------------------------------------------
-- Capa 1 — REVOKE: por qué no alcanza con "no poner políticas"
-- ----------------------------------------------------------------------------
--
-- `seed.sql:22-28` hace dos cosas que conviene tener presentes al leer lo de
-- abajo:
--
--   · `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, ...`
--   · `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ...`
--
-- O sea: una tabla nueva en `public` **nace con SELECT/INSERT/UPDATE/DELETE
-- otorgados a `anon`**. No es una peculiaridad local: en la nube los default
-- privileges hacen lo mismo. La 046 dio por supuesto lo contrario y la 048
-- existió solamente para corregirla. No se vuelve a apostar a eso.
--
-- El REVOKE de abajo no es redundante con RLS, es la segunda cerradura. Con
-- RLS activo y sin política de SELECT, `anon` ya no lee. Pero si mañana
-- alguien corre un `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` —por error, por
-- una restauración a medias, por un script de diagnóstico que quedó pegado—,
-- con el GRANT del seed intacto la tabla entera pasa a ser legible desde
-- internet con una clave que está publicada en el bundle del navegador. Con el
-- REVOKE, ese mismo accidente no expone nada: `anon` no tiene el privilegio de
-- tabla, y el privilegio de tabla se evalúa antes que RLS.
--
-- Dicho al revés: sin esto, RLS sería un punto único de falla para los datos
-- personales de cada persona que escribe al sitio.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enum
--
-- `tipo` es un enum de Postgres y no un TEXT con CHECK porque el que escribe no
-- pasa necesariamente por el formulario de React: un bot postea contra
-- PostgREST directamente. Un TEXT libre acepta cualquier cosa y el problema
-- aparece meses después, en el `Record<TicketCategory, ...>` del panel, como un
-- `undefined` al indexar. El enum lo rechaza en la base, que es donde se puede
-- rechazar de una sola vez para todos los clientes presentes y futuros.
--
-- Los valores son los tres literales que ya manda el formulario y que el resto
-- del sistema usa como nombre de rol (`config/roles.ts`): se deja el castellano
-- a propósito para no inventar una capa de traducción entre el `<select>` y la
-- columna. Mismo criterio de declaración que los enums de la 002 (002:15-29).
-- ----------------------------------------------------------------------------
CREATE TYPE contact_message_type AS ENUM ('dueno', 'veterinaria', 'municipio');

-- ----------------------------------------------------------------------------
-- contact_messages
--
-- Capa 3 — el esquema rechaza basura.
--
-- Todos los CHECK de acá existen por la misma razón: la validación de Zod vive
-- en el cliente y en el server action, y las dos son opcionales para quien
-- postea a PostgREST con la anon key. La última palabra la tiene la tabla.
--
-- Los topes de longitud no son decorativos. Un TEXT de Postgres admite hasta
-- ~1 GB: sin tope, un solo request puede depositar un megabyte de basura por
-- fila, y el costo no es el disco sino el panel de administración, que después
-- tiene que renderizarlo. Los valores elegidos son holgados para un humano y
-- ajustados para un bot:
--
--   · nombre 120       — un nombre y apellido largos entran de sobra.
--   · email 254        — el máximo real de una dirección (RFC 5321), no un
--                        número elegido a ojo.
--   · telefono 40      — alcanza para prefijo internacional, separadores y una
--                        aclaración corta.
--   · organizacion 160 — razón social completa de una veterinaria o municipio.
--   · ciudad 120       — el topónimo más largo de Argentina no se acerca.
--   · mensaje 4000     — cuatro mil caracteres son unas dos carillas. Quien
--                        necesita más está mandando un adjunto, no un mensaje,
--                        y este formulario no recibe adjuntos.
--
-- `nombre` y `mensaje` además exigen `length(trim(...)) > 0`: un NOT NULL deja
-- pasar la cadena vacía y una llena de espacios, y las dos llegan al panel como
-- una fila sin contenido que igual hay que mirar.
--
-- El CHECK de `email` es deliberadamente laxo: exige arroba, algo antes, algo
-- después y al menos un punto en el dominio, sin espacios. Una expresión que
-- intente ser fiel a la RFC 5322 rechaza direcciones válidas y raras, y el
-- costo de ese falso negativo —una persona que no puede contactarnos— es mucho
-- más alto que el de una dirección sintácticamente válida que rebota al
-- responder.
--
-- Capa 4 — `turnstile_verdict` queda en NULL hasta que exista la key.
--
-- La columna es nullable y hoy nadie la escribe. Está ahora, y no cuando haga
-- falta, porque agregarla después obliga a una migración más sobre una tabla
-- que ya tiene tráfico público. El enchufe del lado de la aplicación está
-- marcado en `contact-actions.ts`: la verificación del token va ANTES del
-- insert, y lo que se guarda acá es el veredicto ya resuelto ('success',
-- 'failed', o el código de error de Cloudflare), nunca el token, que es de un
-- solo uso y no tiene por qué persistir. NULL significa exactamente "esta fila
-- entró cuando todavía no había verificación", y eso es un dato útil el día que
-- haya que separar el antes del después.
-- ----------------------------------------------------------------------------
CREATE TABLE contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT NOT NULL,
  organizacion TEXT,
  ciudad TEXT,
  tipo contact_message_type NOT NULL,
  mensaje TEXT NOT NULL,
  turnstile_verdict TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contact_messages_nombre_no_vacio
    CHECK (length(trim(nombre)) > 0),
  CONSTRAINT contact_messages_nombre_largo
    CHECK (length(nombre) <= 120),

  CONSTRAINT contact_messages_email_formato
    CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$'),
  CONSTRAINT contact_messages_email_largo
    CHECK (length(email) <= 254),

  CONSTRAINT contact_messages_telefono_no_vacio
    CHECK (length(trim(telefono)) > 0),
  CONSTRAINT contact_messages_telefono_largo
    CHECK (length(telefono) <= 40),

  CONSTRAINT contact_messages_organizacion_largo
    CHECK (organizacion IS NULL OR length(organizacion) <= 160),
  CONSTRAINT contact_messages_ciudad_largo
    CHECK (ciudad IS NULL OR length(ciudad) <= 120),

  CONSTRAINT contact_messages_mensaje_no_vacio
    CHECK (length(trim(mensaje)) > 0),
  CONSTRAINT contact_messages_mensaje_largo
    CHECK (length(mensaje) <= 4000),

  CONSTRAINT contact_messages_turnstile_verdict_largo
    CHECK (turnstile_verdict IS NULL OR length(turnstile_verdict) <= 64)
);

-- El panel lista de más nuevo a más viejo y no filtra por nada más.
CREATE INDEX idx_contact_messages_created_at
  ON contact_messages (created_at DESC);

-- ----------------------------------------------------------------------------
-- Capa 1 — deshacer lo que el seed y los default privileges regalaron.
--
-- El orden importa: primero se saca todo, después se devuelve lo único que hace
-- falta. Un GRANT selectivo sin el REVOKE previo no quita nada, porque los
-- privilegios se suman.
--
-- `anon` —la internet entera, con una clave que viaja en el bundle del
-- navegador— queda con **INSERT y nada más**. Ni SELECT, ni UPDATE, ni DELETE,
-- ni ahora ni por accidente: aunque alguien desactive RLS sobre esta tabla, un
-- visitante sigue sin poder leer un solo mensaje ajeno, porque el privilegio de
-- tabla se evalúa antes que cualquier política.
--
-- `authenticated` queda con INSERT y SELECT. El SELECT no es un descuido y es
-- la única concesión de esta migración, así que conviene que quede escrito por
-- qué: el admin de la plataforma **es** un `authenticated` —no hay un rol de
-- Postgres separado para el backoffice—, y una política de SELECT sin el
-- privilegio de tabla que la habilite no filtra filas, directamente nunca
-- llega a evaluarse: PostgREST responde "permission denied for table". O sea
-- que `GRANT SELECT TO authenticated` es la condición para que
-- `contact_messages_select_admin` exista de verdad.
--
-- Lo que se pierde con eso, dicho sin adornos: para `authenticated`, y solo
-- para `authenticated`, RLS vuelve a ser la única cerradura de lectura. Si se
-- desactivara, cualquier cuenta con sesión podría leer la bandeja. Es
-- estrictamente peor que lo de `anon` y estrictamente mejor que la alternativa
-- —abrirle la lectura a `anon` también—, y es el mismo trato que la 046 le da a
-- `admin_action_log`. La lectura del panel va con la sesión del admin y no con
-- la service role por el motivo que `admin/data/admin-log.ts` ya explica: la
-- política autoriza a leer TODAS las filas, así que no hace falta agrandar la
-- superficie que corre con privilegios de servicio.
--
-- `service_role` conserva lo suyo: saltea RLS por diseño y es el camino de los
-- scripts de mantenimiento y de las pruebas que preparan escenarios.
-- ----------------------------------------------------------------------------
REVOKE ALL ON contact_messages FROM anon, authenticated;
GRANT INSERT ON contact_messages TO anon, authenticated;
GRANT SELECT ON contact_messages TO authenticated;

-- ----------------------------------------------------------------------------
-- Capa 2 — RLS: una sola política de escritura, una sola de lectura.
-- ----------------------------------------------------------------------------
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Escribir: cualquiera, con o sin sesión. Es un formulario público; exigir
-- cuenta para poder escribirnos sería pedirle al que pregunta que se registre
-- antes de preguntar.
--
-- El `WITH CHECK` prohíbe explícitamente lo único que un cliente podría querer
-- inyectar y no le corresponde: `turnstile_verdict`. Esa columna la escribe el
-- servidor después de hablar con Cloudflare, y si un día el server action deja
-- de mandarla explícitamente en NULL, la política impide que el valor lo ponga
-- quien está siendo verificado. Es la diferencia entre un veredicto y una
-- declaración jurada.
CREATE POLICY "contact_messages_insert" ON contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (turnstile_verdict IS NULL);

-- Leer: solo el equipo de la plataforma. Misma forma exacta que
-- `admin_action_log_select` (046:109-110) y por el mismo motivo: autoriza a
-- cualquier admin a ver **todas** las filas, no solo las propias, que es lo que
-- una bandeja de soporte necesita para existir.
CREATE POLICY "contact_messages_select_admin" ON contact_messages FOR SELECT
  TO authenticated
  USING (is_platform_admin());

-- ----------------------------------------------------------------------------
-- Por qué NO hay política de UPDATE para el admin
--
-- La pregunta se hizo y la respuesta es no, por ahora. El panel muestra un
-- selector de estado ("abierto", "en curso", "cerrado"), pero ese selector hoy
-- solamente dispara un toast: no existe ninguna acción que persista un cambio
-- de estado, ni acá ni antes de esta migración. Agregar la columna `status` y
-- su política de UPDATE sería otorgar un privilegio que ningún llamador usa, y
-- dejar en la tabla un campo que nadie puede mover — una columna que miente,
-- que es exactamente el problema que esta migración vino a resolver del otro
-- lado.
--
-- El día que el backoffice sepa responder un mensaje, esa funcionalidad trae su
-- propia migración con la columna de estado, su política de UPDATE acotada a
-- `is_platform_admin()`, y el `GRANT UPDATE (status)` correspondiente. Mientras
-- tanto el mapper del panel reporta cada mensaje como "abierto", que no es un
-- valor de relleno: es la verdad, porque nada en el sistema puede sacarlo de
-- ahí.
--
-- Tampoco hay DELETE. Un pedido de baja de datos personales se atiende con la
-- service role y queda registrado; no es un botón del panel.
-- ----------------------------------------------------------------------------

COMMENT ON TABLE contact_messages IS
  'Mensajes del formulario público de contacto. anon/authenticated solo '
  'INSERT (privilegio de tabla + política); leer es exclusivo de '
  'is_platform_admin(). Ver el encabezado de la 054 antes de agregar cualquier '
  'GRANT o política nueva.';

COMMENT ON COLUMN contact_messages.turnstile_verdict IS
  'Veredicto ya resuelto de Cloudflare Turnstile, nunca el token. NULL = la '
  'fila entró antes de que existiera la verificación.';
