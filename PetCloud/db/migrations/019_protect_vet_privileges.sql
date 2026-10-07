-- 019 · Que un veterinario no se firme sus propios permisos
--
-- La política `"Vet professionals can update own record"` de la 001 dice
-- `USING (auth.uid() = profile_id)` y nada más. RLS decide **filas**, no
-- columnas: quien puede actualizar su fila puede actualizar cualquier columna
-- de su fila. Entre ellas, tres que no son datos suyos sino permisos:
--
--  1. `license_validated` — es lo único que mira `is_validated_vet()`, que a su
--     vez controla el trigger `enforce_signature_requires_license()` de la 008
--     y la emisión de certificados de la 016. Una cuenta recién registrada
--     podía ponérselo en true y quedar habilitada para firmar registros
--     clínicos. Justamente lo que le da valor sanitario al registro frente al
--     municipio.
--
--  2. `license_number` — validar con una matrícula real y después cambiarla por
--     otra deja el `license_validated = true` apuntando a un número que nadie
--     revisó. Se puede corregir mientras la matrícula está sin validar, que es
--     el caso legítimo; una vez validada queda congelada.
--
--  3. `role_in_institution` — `is_institution_owner()` sale de acá (005), y con
--     eso se borran miembros del equipo y se edita la institución. Un asistente
--     podía ascenderse a dueño de la veterinaria.
--
-- El patrón es el mismo que `protect_municipality_validation` de la 017: se
-- revierte el valor en silencio en vez de cortar con una excepción. Un UPDATE
-- que toca varias columnas guarda las legítimas —teléfono, especialidad, firma—
-- y descarta la que no corresponde, sin que la pantalla tenga que distinguir.
--
-- **Sin `SECURITY DEFINER`, a propósito.** La 009 existe porque
-- `enforce_signature_requires_license()` lo tenía, y dentro de una función
-- definer `current_user` es la dueña de la función (postgres), con lo cual la
-- exención de abajo se cumplía siempre y la guarda no guardaba nada.

CREATE OR REPLACE FUNCTION protect_vet_privileges()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- La validación de la matrícula la hace el equipo de PetCloud, nunca la
  -- persona validada.
  IF NEW.license_validated IS DISTINCT FROM OLD.license_validated THEN
    NEW.license_validated := OLD.license_validated;
  END IF;

  -- Corregir el número está bien hasta que alguien lo haya revisado.
  IF OLD.license_validated
     AND NEW.license_number IS DISTINCT FROM OLD.license_number
  THEN
    NEW.license_number := OLD.license_number;
  END IF;

  -- Quién manda en la veterinaria no se decide desde la propia fila.
  IF NEW.role_in_institution IS DISTINCT FROM OLD.role_in_institution THEN
    NEW.role_in_institution := OLD.role_in_institution;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vet_professionals_protect_privileges ON vet_professionals;

-- BEFORE UPDATE y antes que `vet_professionals_updated_at` en orden alfabético
-- no importa acá: los dos son BEFORE ROW y tocan columnas distintas.
CREATE TRIGGER vet_professionals_protect_privileges
  BEFORE UPDATE ON vet_professionals
  FOR EACH ROW EXECUTE FUNCTION protect_vet_privileges();

COMMENT ON FUNCTION protect_vet_privileges IS
  'Impide que un profesional se cambie a sí mismo la validación de matrícula, '
  'el número ya validado o su rol en la institución. Mismo patrón que '
  'protect_municipality_validation (017).';
