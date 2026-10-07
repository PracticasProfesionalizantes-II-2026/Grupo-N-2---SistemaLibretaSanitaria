-- 012 · El resumen de la visita y el contacto del dueño
--
-- Dos cosas que la fase 3 dejó sin base: dónde guardar lo que se escribe al
-- cerrar una atención, y cómo hace el veterinario para saber a quién llamar.

-- ----------------------------------------------------------------------------
-- 1 · Qué se le hizo a la mascota en esa visita
--
-- El modal de "Cerrar atención" pide un resumen y le promete al dueño que lo va
-- a ver en su historial, pero no había dónde guardarlo: `visits` solo sabía que
-- la mascota llegó y cuándo se fue. El texto se escribía y se perdía.
--
-- La alternativa era crear un `medical_records` por cada cierre. Se descartó: un
-- registro clínico es un documento firmable, con matrícula y valor sanitario.
-- "Se aplicó antirrábica y se indicó dieta blanda" es una nota de mostrador, no
-- un acto médico firmado, y meterla en la historia clínica ensuciaría lo que el
-- municipio y el dueño leen como atenciones formales.
--
-- Por eso la visita guarda su propio resumen y `medical_record_id` sigue siendo
-- el vínculo opcional con la consulta completa, cuando la hubo.
-- ----------------------------------------------------------------------------

ALTER TABLE visits ADD COLUMN IF NOT EXISTS summary TEXT;

COMMENT ON COLUMN visits.summary IS
  'Resumen de mostrador de la atención. La consulta clínica formal, si la hubo, '
  'vive en medical_records y se referencia con medical_record_id.';

-- No se agregan políticas para la columna: `visits` ya tiene las suyas de la 008
-- y la columna viaja con la fila. Quien puede leer o actualizar la visita puede
-- leer o actualizar su resumen, que es exactamente lo que se quiere.

-- ----------------------------------------------------------------------------
-- 2 · El veterinario lee el contacto del dueño de su paciente
--
-- Hasta acá `profiles` solo se dejaba leer a uno mismo, así que la ficha del
-- paciente abría sin nombre, sin teléfono y sin dirección: el veterinario tenía
-- al animal adelante y ninguna forma de avisarle a nadie. La 001 ya anotaba esto
-- como pendiente.
--
-- El criterio es el mismo que el de `signed_for_my_pet` en la 010: no se abre la
-- tabla a "los veterinarios", se abre la relación que **ya existe** y quedó
-- registrada. Un dueño es visible cuando alguna de sus mascotas pasó por esta
-- institución — tiene una visita o un registro clínico de acá.
--
-- Esto tiene una consecuencia que conviene decir en voz alta: el contacto NO
-- aparece con el solo escaneo del QR. Aparece cuando la mascota se registra en
-- la sala de espera o se le carga una consulta, que es cuando el vínculo existe
-- de verdad y queda auditado. Escanear una chapita no puede ser la llave a los
-- datos personales de alguien: si lo fuera, cualquier profesional podría leer el
-- domicilio de cualquier persona del país con solo tipear códigos.
--
-- Para la mascota encontrada en la calle está el otro camino, el público:
-- /p/[qrCode] y el aviso de mascota perdida, que le escriben al dueño sin
-- mostrarle sus datos a quien la encontró.
-- ----------------------------------------------------------------------------

/**
 * ¿Este perfil es el de un dueño que ya trajo una mascota a mi institución?
 *
 * SECURITY DEFINER a propósito: adentro lee `visits`, `medical_records` y `pets`
 * sin que se evalúen las políticas de esas tablas. Eso es lo que corta la
 * recursión —una política de `profiles` que consultara `pets`, cuyas políticas a
 * su vez miran `profiles`, sería el 42P17 de la 005 otra vez— y además permite
 * comprobar la relación aunque el veterinario no pueda leer esas filas.
 *
 * Sin `is_vet()` adentro: la política de afuera ya lo exige, y repetirlo acá
 * haría creer que la función se puede llamar suelta sin consecuencias.
 */
CREATE OR REPLACE FUNCTION owner_of_my_patient(p_owner_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM visits v
    JOIN pets p ON p.id = v.pet_id
    WHERE p.owner_id = p_owner_id
      AND v.institution_id = my_vet_institution_id()
  ) OR EXISTS (
    SELECT 1
    FROM medical_records m
    JOIN pets p ON p.id = m.pet_id
    WHERE p.owner_id = p_owner_id
      AND m.institution_id = my_vet_institution_id()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Las dos mitades del EXISTS filtran por institución y llegan al dueño por
-- `pets`. Sin estos índices cada lectura de la ficha recorre las dos tablas
-- enteras.
CREATE INDEX IF NOT EXISTS idx_visits_institution ON visits(institution_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_institution ON medical_records(institution_id);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);

DROP POLICY IF EXISTS "vet_reads_patient_owner" ON profiles;
CREATE POLICY "vet_reads_patient_owner"
  ON profiles FOR SELECT
  USING (is_vet() AND owner_of_my_patient(id));

-- Solo SELECT, y sin tocar "Users can update own profile": el veterinario lee
-- para poder llamar, nunca corrige los datos de otra persona.
--
-- RLS es por fila, no por columna, así que esto expone la fila entera. Es
-- aceptable acá porque `profiles` no guarda email ni credenciales —el email vive
-- en auth.users, que sigue cerrado—: son nombre, teléfono, dirección, avatar y
-- rol. Si algún día se agrega un dato sensible a esta tabla, esta política es lo
-- primero que hay que volver a mirar.
