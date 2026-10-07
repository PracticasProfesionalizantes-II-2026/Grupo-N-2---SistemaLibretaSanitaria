-- ============================================================================
-- PetCloud — Migración 077: el contacto del dueño solo para la clínica que lo
-- atiende, y la baja blanda saca a la persona de `is_vet()`
--
-- EL AGUJERO QUE CIERRA
--
-- La 075 dejó `get_pet_owner_profile_for_vet` guardada solo por `is_vet()`, y
-- lo anotó como alcance aceptado. La cadena que lo vuelve grave:
--   1. `signUpVet` deja registrarse como veterinario a cualquiera, con
--      cualquier matrícula: crea la fila en `vet_professionals` con service
--      role y `is_vet()` pasa a ser true sin que nadie valide nada.
--   2. `pets_select_vet` (008) es `USING (is_vet())`: esa cuenta lista los id
--      de todas las mascotas de la plataforma.
--   3. La 075 le devuelve, por cada id, nombre, teléfono y dirección del dueño.
-- O sea: una cuenta recién creada podía bajarse el padrón de contactos entero
-- en silencio, sin dejar rastro.
--
-- LA GUARDA NUEVA
--
-- La mascota tiene que tener, en la institución **activa** de quien llama, al
-- menos una de estas tres cosas:
--   · una visita (`visits`)          — la sala de espera y el check-in por QR
--                                      crean la visita antes de abrir la ficha;
--   · un registro clínico            — lo mismo que ya pide `is_my_patient()`;
--   · un turno no cancelado          — es la única relación que existe **antes**
--     (`appointments`)                 de la primera visita, y es exactamente
--                                      el caso por el que se hizo la 075.
--
-- Lo que se pierde, aceptado: escanear el QR de un paciente nuevo y abrir la
-- ficha **sin** pasarlo por la sala de espera ni tener turno. La ficha se abre
-- igual —`pets_select_vet` no se toca—, solo que sin teléfono ni dirección
-- hasta que exista la visita. Es lo mismo que ya mostraba la tarjeta del
-- escáner, que lee por el join embebido (`vet_reads_patient_owner`, 012).
--
-- Por qué no alcanza con `is_my_patient()`: no mira turnos, así que rompería la
-- primera atención con turno. Y se apoya en `my_vet_institution_id()`, que no
-- filtra `removed_at`: una persona dada de baja sigue resolviendo a la clínica
-- de donde la sacaron. Por eso la institución se resuelve acá, con
-- `removed_at IS NULL` explícito, y no con esa función.
--
-- LO QUE ESTA GUARDA NO RESUELVE, PARA QUE NADIE LO CREA
--
-- `visits_insert` y `appointments_insert` no exigen ninguna relación previa con
-- la mascota: una cuenta de veterinario puede crear una visita para cualquier
-- id y después pedir el contacto. La diferencia con antes es que ahora cada
-- lectura deja una fila a nombre de su institución, que el dueño ve en el
-- historial de la mascota. Pasa de ser una lectura masiva y silenciosa a una
-- por mascota y con rastro. Cerrarlo del todo es la decisión pendiente sobre
-- `pets_select_vet` (docs/decisiones/el-veterinario-ve-cualquier-mascota.md).
--
-- POR QUÉ NO SE EXIGE `license_validated`
--
-- La validación existe y es operativa desde la 060, pero la recepcionista
-- (`role_in_institution = 'assistant'`) no tiene matrícula por CHECK (058) y
-- por lo tanto nunca queda validada: es quien recibe al dueño en la sala de
-- espera y quien más necesita el teléfono. Y un profesional recién registrado
-- ya atiende —sin firmar— mientras el equipo revisa su matrícula. La relación
-- con la mascota es la guarda que discrimina; la matrícula no.
--
-- `is_vet()` Y LA BAJA BLANDA
--
-- La 058 introdujo `removed_at` y dejó dicho que toda condición de pertenencia
-- debe filtrarlo, pero `is_vet()` (005) quedó sin tocar: quien era dado de baja
-- seguía leyendo historias clínicas de toda la plataforma. Usos revisados antes
-- de cambiarla (pg_policy/pg_proc sobre la base local):
--   · políticas: pets, medical_records, vaccinations (select y la verificación
--     de la 076), dewormings, medications, conditions, weight_records,
--     pet_documents, profiles (`vet_reads_patient_owner`) y los tres de
--     storage `medical_studies_*`;
--   · funciones: solo `get_pet_owner_profile_for_vet`;
--   · código de la app: ninguna llamada directa.
-- Todos son "es veterinario en ejercicio". Ninguno quiere incluir a alguien
-- dado de baja. Quien tiene una baja en una clínica y una fila activa en otra
-- sigue siendo veterinario: la fila activa alcanza.
--
-- Cuerpos reemplazados: `is_vet()` de la 005 y `get_pet_owner_profile_for_vet`
-- de la 075. El ROLLBACK al pie los restaura.
-- ============================================================================

CREATE OR REPLACE FUNCTION is_vet()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vet_professionals
    WHERE profile_id = auth.uid()
      AND removed_at IS NULL
  );
$$;

COMMENT ON FUNCTION is_vet() IS
  'true si quien llama tiene una fila activa (removed_at IS NULL) en '
  'vet_professionals. Desde la 077 la baja blanda cuenta.';

CREATE OR REPLACE FUNCTION get_pet_owner_profile_for_vet(p_pet_id UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_institution UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_vet() THEN
    RAISE EXCEPTION 'Solo un profesional veterinario puede ver el contacto del dueño.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Una sola fila activa por persona (índice parcial de la 058).
  SELECT vp.institution_id INTO v_institution
  FROM public.vet_professionals vp
  WHERE vp.profile_id = auth.uid()
    AND vp.removed_at IS NULL;

  -- Sin relación con la mascota se devuelve vacío, no un error: la ficha sigue
  -- con lo que trajo el join y no se distingue "no existe" de "no es tuyo".
  RETURN QUERY
  SELECT pr.id, pr.first_name, pr.last_name, pr.phone, pr.address, pr.avatar_url
  FROM public.pets p
  JOIN public.profiles pr ON pr.id = p.owner_id
  WHERE p.id = p_pet_id
    AND v_institution IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.visits v
        WHERE v.pet_id = p.id AND v.institution_id = v_institution
      )
      OR EXISTS (
        SELECT 1 FROM public.medical_records mr
        WHERE mr.pet_id = p.id AND mr.institution_id = v_institution
      )
      OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.pet_id = p.id
          AND a.institution_id = v_institution
          AND a.status <> 'cancelled'
      )
    );
END;
$$;

COMMENT ON FUNCTION get_pet_owner_profile_for_vet(UUID) IS
  'Contacto del dueño principal para la ficha del paciente. Solo si la '
  'institución activa de quien llama tiene visita, registro clínico o turno no '
  'cancelado con la mascota. Sin email. 075, acotada en la 077.';

-- Los permisos de `is_vet()` quedan como estaban (CREATE OR REPLACE los
-- conserva) y es a propósito: la evalúan políticas de SELECT de tablas que anon
-- también consulta. Revocársela a anon convertiría el "cero filas" de hoy en un
-- error de permiso. No expone nada: sin sesión, `auth.uid()` es NULL y da false.

REVOKE ALL ON FUNCTION get_pet_owner_profile_for_vet(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_pet_owner_profile_for_vet(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_pet_owner_profile_for_vet(UUID) TO authenticated;

-- ROLLBACK
-- CREATE OR REPLACE FUNCTION is_vet() RETURNS BOOLEAN LANGUAGE sql STABLE
--   SECURITY DEFINER SET search_path = public AS $$
--   SELECT EXISTS (SELECT 1 FROM vet_professionals WHERE profile_id = auth.uid());
-- $$;
-- Y el cuerpo de get_pet_owner_profile_for_vet de la 075, tal cual.
