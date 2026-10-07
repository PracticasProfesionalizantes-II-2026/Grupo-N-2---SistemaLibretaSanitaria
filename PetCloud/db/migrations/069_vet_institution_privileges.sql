-- ============================================================================
-- PetCloud — Migración 069: el titular no se valida solo
--
-- EL AGUJERO
--
-- La única política de UPDATE de `vet_institutions` es `Vet owners can update
-- own institution` (005), `USING (is_institution_owner(id))`, sin `WITH CHECK`
-- y sin ningún trigger que proteja columnas. `authenticated` tiene UPDATE
-- sobre `validated` y `validated_at`. Resultado, comprobado contra la base
-- local: un titular corría `UPDATE vet_institutions SET validated = true` y
-- **quedaba validado**. Como `vet_institutions_nearby()` filtra
-- `WHERE v.validated`, eso es auto-publicarse en el directorio de los dueños
-- sin que PetCloud haya revisado nada.
--
-- Ningún código de la aplicación escribe `vet_institutions.validated`: la
-- validación es del equipo de PetCloud, con service role.
--
-- EL ARREGLO
--
-- El mismo patrón que `protect_vet_privileges()` sobre `vet_professionals`: un
-- `BEFORE UPDATE` que revierte en silencio las columnas privilegiadas a `OLD`
-- para todo el que no sea service role / postgres / supabase_admin. La tupla
-- de exención es la misma, copiada textual de esa función. No es
-- `SECURITY DEFINER`: tiene que ver el `current_user` de quien escribe, no el
-- de su dueño.
--
-- Se revierte en vez de tirar error por consistencia con la otra guarda: el
-- formulario de datos de la institución manda la fila y no tiene por qué
-- fallar entero porque alguien metió una columna de más a mano.
--
-- La política no se toca: solo el titular edita la institución (horarios
-- incluidos), y eso es deliberado.
-- ============================================================================

CREATE OR REPLACE FUNCTION protect_institution_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.validated IS DISTINCT FROM OLD.validated THEN
    NEW.validated := OLD.validated;
  END IF;

  IF NEW.validated_at IS DISTINCT FROM OLD.validated_at THEN
    NEW.validated_at := OLD.validated_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER vet_institutions_protect_privileges
  BEFORE UPDATE ON vet_institutions
  FOR EACH ROW EXECUTE FUNCTION protect_institution_privileges();
