-- ============================================================================
-- PetCloud — Migración 062: los próximos turnos del dueño, de todas sus mascotas
--
-- `get_pet_appointments()` (041) resuelve UNA mascota. Para el widget del
-- inicio hace falta la pregunta inversa —"¿qué turnos tengo yo, de cualquiera
-- de mis mascotas?"— y responderla con la función de la 041 significa una
-- llamada por mascota: el N+1 clásico, en el camino crítico del render del
-- dashboard. Cuatro mascotas son cuatro viajes a la base antes de pintar la
-- primera pantalla que el dueño ve al entrar.
--
-- POR QUÉ `has_pet_access()` Y NO `owner_id = auth.uid()`
--
-- Porque el codueño (034/035) también tiene turnos que le importan. La 041 ya
-- tomó esa decisión para la vista por mascota, y si acá se filtrara por dueño
-- directo, el mismo turno sería visible en el perfil de la mascota e invisible
-- en el inicio. Un dato que aparece y desaparece según la pantalla es peor que
-- uno que falta: nadie sabe cuál de las dos miente.
--
-- Es la misma asimetría que ya existe —y que queda anotada— entre turnos y
-- visitas: `visits_select` (008) usa `owner_id = auth.uid()` y deja al codueño
-- afuera. Esta función no la arregla ni la empeora; la evita.
--
-- QUÉ NO PROYECTA
--
-- `internal_notes` no sale de acá, por el mismo motivo que no sale de la 041:
-- es la nota clínica interna del profesional y nunca tiene que llegar al
-- dueño. `SECURITY DEFINER` es exactamente lo que obliga a enumerar columnas a
-- mano en vez de confiar en la RLS de la tabla.
--
-- QUÉ CUENTA COMO "PRÓXIMO"
--
-- `starts_at >= now()` y estado en `scheduled` o `confirmed`. Un turno
-- cancelado no es próximo; uno ya atendido o marcado `no_show` tampoco, aunque
-- su hora todavía no haya pasado —el mostrador puede cerrarlo antes—. El
-- filtro se declara acá, en la base, y no en TypeScript, para que el widget
-- del inicio y la pantalla de recordatorios no puedan discrepar sobre qué es
-- un turno próximo.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_owner_upcoming_appointments(p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  id UUID,
  pet_id UUID,
  pet_name TEXT,
  pet_photo_url TEXT,
  starts_at TIMESTAMPTZ,
  duration_min INTEGER,
  reason TEXT,
  status TEXT,
  institution_name TEXT,
  professional_name TEXT
) AS $$
  SELECT a.id,
         a.pet_id,
         p.name,
         p.photo_url,
         a.starts_at,
         a.duration_min,
         a.reason,
         a.status,
         i.name,
         COALESCE(pr.first_name || ' ' || pr.last_name, '')
  FROM appointments a
  JOIN pets p ON p.id = a.pet_id
  JOIN vet_institutions i ON i.id = a.institution_id
  LEFT JOIN vet_professionals vp ON vp.id = a.professional_id
  LEFT JOIN profiles pr ON pr.id = vp.profile_id
  WHERE a.starts_at >= now()
    AND a.status IN ('scheduled', 'confirmed')
    AND has_pet_access(a.pet_id)
  ORDER BY a.starts_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 5), 0);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION get_owner_upcoming_appointments IS
  'Proximos turnos de todas las mascotas a las que la sesion tiene acceso, '
  'codueños incluidos (has_pet_access, 035). Existe para que el inicio del '
  'dueño no haga una llamada por mascota. Nunca proyecta internal_notes.';

REVOKE EXECUTE ON FUNCTION get_owner_upcoming_appointments(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_owner_upcoming_appointments(INTEGER) TO authenticated;

-- ROLLBACK
-- REVOKE EXECUTE ON FUNCTION get_owner_upcoming_appointments(INTEGER) FROM authenticated;
-- DROP FUNCTION IF EXISTS get_owner_upcoming_appointments(INTEGER);
