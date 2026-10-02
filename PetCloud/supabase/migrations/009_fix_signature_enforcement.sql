-- ============================================================================
-- PetCloud — Migración 009: arreglo del control de firma de la 008
--
-- Síntoma: un veterinario con `license_validated = false` podía insertar un
-- registro clínico con `is_signed = true`. El trigger que debía impedirlo no
-- saltaba nunca.
--
-- Causa: `enforce_signature_requires_license()` quedó declarada `SECURITY
-- DEFINER`. Dentro de una función así, `current_user` **es la dueña de la
-- función** (postgres), no quien la invoca — y la condición de exención decía
-- justamente `current_user NOT IN ('service_role','postgres','supabase_admin')`.
-- O sea que la guarda se auto-eximía en todas las llamadas.
--
-- Los otros dos triggers de este tipo —`protect_profile_role` (001) y
-- `protect_pet_ownership` (002)— no tienen el problema porque se escribieron sin
-- `SECURITY DEFINER`. Este se desvió del patrón y por eso falló.
--
-- Arreglo: sacarle `SECURITY DEFINER`. No lo necesita: lo único que consulta lo
-- hace a través de `is_validated_vet()`, que sí es definer y puede leer
-- `vet_professionals` por su cuenta.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_signature_requires_license()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_signed
     AND (TG_OP = 'INSERT' OR NOT OLD.is_signed)
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND NOT is_validated_vet()
  THEN
    RAISE EXCEPTION 'Solo un profesional con matrícula validada puede firmar un registro clínico.';
  END IF;

  IF NEW.is_signed THEN
    NEW.is_draft := FALSE;
    NEW.signed_at := COALESCE(NEW.signed_at, now());
  END IF;

  RETURN NEW;
END;
-- Sin SECURITY DEFINER: acá `current_user` tiene que ser quien escribe de
-- verdad, que es lo que distingue a `authenticated` de `service_role`.
$$ LANGUAGE plpgsql SET search_path = public;

-- ----------------------------------------------------------------------------
-- El borrador no llega a la libreta del dueño
--
-- La regla de la fase dice que un registro sin firmar no se publica. Hasta ahora
-- eso lo garantizaba solo el `.eq("is_draft", false)` de las consultas: RLS lo
-- dejaba pasar, y una consulta nueva que se olvidara del filtro le mostraría al
-- dueño un diagnóstico a medio escribir.
--
-- El veterinario sigue viendo sus propios borradores: los cubre
-- `medical_records_select_vet`, que va por OR con esta.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "medical_records_select" ON medical_records;

CREATE POLICY "medical_records_select" ON medical_records FOR SELECT
  USING (has_pet_access(pet_id) AND NOT is_draft);
