import "server-only";

import { sql } from "drizzle-orm";

/**
 * Selecciones compartidas del panel veterinario. Devuelven filas con la misma
 * forma que los "embeds" de PostgREST que leen los mappers (`pets` con su
 * `profiles` y `vaccinations`, `visits` con sus nombres, etc.). Se completan
 * con `where`/`order by` sobre el alias de la tabla principal.
 */

/** `pets` (alias `pets`) con el dueño y las próximas dosis. */
export const PET_SELECT = sql`select pets.*,
  (select json_build_object('first_name', p.first_name, 'last_name', p.last_name,
     'phone', p.phone, 'address', p.address)
     from profiles p where p.id = pets.owner_id) as profiles,
  coalesce((select json_agg(json_build_object('next_dose_at', v.next_dose_at))
     from vaccinations v where v.pet_id = pets.id), '[]') as vaccinations
  from pets`;

/** `visits` (alias `v`) con mascota, dueño, institución y consulta. */
export const VISIT_SELECT = sql`select v.*,
  (select json_build_object('name', pt.name) from pets pt
    where pt.id = v.pet_id) as pets,
  (select json_build_object('first_name', p.first_name, 'last_name', p.last_name)
     from profiles p where p.id = v.owner_id) as profiles,
  (select json_build_object('name', i.name) from vet_institutions i
    where i.id = v.institution_id) as vet_institutions,
  (select json_build_object('observations', m.observations) from medical_records m
    where m.id = v.medical_record_id) as medical_records
  from visits v`;

/** `medical_records` (alias `m`) con institución y profesional. */
export const MEDICAL_RECORD_SELECT = sql`select m.*,
  (select json_build_object('name', i.name) from vet_institutions i
    where i.id = m.institution_id) as vet_institutions,
  (select json_build_object('license_number', vp.license_number,
     'profiles', (select json_build_object('first_name', p.first_name,
       'last_name', p.last_name) from profiles p where p.id = vp.profile_id))
     from vet_professionals vp where vp.id = m.vet_professional_id) as vet_professionals
  from medical_records m`;
