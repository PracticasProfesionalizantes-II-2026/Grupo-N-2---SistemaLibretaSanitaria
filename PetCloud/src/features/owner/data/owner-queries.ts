import "server-only";

import { cache } from "react";

import { sql } from "drizzle-orm";

import { getDb, query } from "@/lib/db";
import { getCurrentUser } from "@/features/auth/lib/current-user";
import {
  healthStatus,
  toPet,
  toPetDocument,
  toReminder,
} from "@/features/owner/lib/mappers";
import type { Permiso } from "@/features/owner/lib/permissions";
import type { Pet, PetDocument } from "@/types/pet";
import type { Reminder } from "@/types/schedule";
import type { Tables } from "@/types/supabase";
import type { Visit } from "@/types/visit";
import {
  iOwnPet,
  myPetIds,
  myPetScope,
} from "@/features/owner/data/owner-scope";
import {
  VISIT_SELECT,
  toVisit,
  type VisitRow,
} from "@/features/owner/data/visit-mapper";

/**
 * Lecturas que cruzan TODAS las mascotas del dueño: las pantallas de Inicio,
 * Visitas, Recordatorios, Documentos, Notificaciones y Accesos.
 *
 * Se separan de las de una sola mascota porque responden otra pregunta: no
 * "qué le pasó a este animal" sino "qué tengo yo".
 */

/**
 * La base no aplica RLS para la conexión de la app: toda lectura de este
 * archivo acota explícitamente a las mascotas del usuario (`myPetScope`).
 */

/** Vacío es lo correcto cuando no hay sesión: no es un error, es que no hay nada suyo. */
const SIN_DATOS = [] as const;

export async function listMyPets(): Promise<Pet[]> {
  const user = await getCurrentUser();
  if (!user) return [...SIN_DATOS];

  // Se traen las próximas dosis junto con la mascota para derivar el estado
  // sanitario sin una consulta por animal.
  const data = await query<
    Tables<"pets"> & { vaccinations: { next_dose_at: string | null }[] }
  >(
    getDb(),
    sql`select pets.*, coalesce((select json_agg(json_build_object(
          'next_dose_at', v.next_dose_at)) from vaccinations v
          where v.pet_id = pets.id), '[]') as vaccinations
        from pets where ${myPetScope(user.id)} order by created_at`,
  );

  return data.map((row) => {
    const { vaccinations, ...pet } = row;
    return toPet(pet, { estadoSanitario: healthStatus(vaccinations) });
  });
}

/**
 * Todas las visitas de todas sus mascotas, para la pantalla de Visitas.
 *
 * Lee `visits` (la cola de la sala de espera, migración 008), no
 * `medical_records`: la historia clínica solo tiene fila cuando el
 * veterinario cierra una consulta formal, así que una visita en curso o
 * retirada nunca aparecía. Acotado a las mascotas del usuario.
 */
export async function listMyVisits(): Promise<Visit[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const data = await query<VisitRow>(
    getDb(),
    sql`${VISIT_SELECT}
        where v.pet_id in (select id from pets where ${myPetScope(user.id)})
        order by v.checked_in_at desc`,
  );

  return data.map(toVisit);
}

export async function listMyReminders(): Promise<Reminder[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const data = await query<Tables<"reminders">>(
    getDb(),
    sql`select * from reminders
         where pet_id in (select id from pets where ${myPetScope(user.id)})
         order by scheduled_at`,
  );

  return data.map(toReminder);
}

/**
 * Lo último que se cargó, de cualquier mascota y de cualquier tipo.
 *
 * Es la tarjeta de "últimos registros" del inicio. Se consultan las tres tablas
 * por separado y se mezclan acá.
 */
export async function listRecentRecords() {
  const user = await getCurrentUser();
  if (!user) return [];

  const ids = await myPetIds(user.id);
  if (ids.length === 0) return [];

  const db = getDb();
  type Fila = { id: string; pet_id: string; pet_name: string | null };
  const [vacunas, antiparasitarios, pesos] = await Promise.all([
    query<Fila & { vaccine_name: string; applied_at: string }>(
      db,
      sql`select x.id, x.pet_id, x.vaccine_name, x.applied_at::text, p.name as pet_name
            from vaccinations x join pets p on p.id = x.pet_id
           where x.pet_id = any(${sql.param(ids)}::uuid[])
           order by x.applied_at desc limit 5`,
    ),
    query<Fila & { product_name: string; applied_at: string }>(
      db,
      sql`select x.id, x.pet_id, x.product_name, x.applied_at::text, p.name as pet_name
            from dewormings x join pets p on p.id = x.pet_id
           where x.pet_id = any(${sql.param(ids)}::uuid[])
           order by x.applied_at desc limit 5`,
    ),
    query<Fila & { value: number; recorded_at: string }>(
      db,
      sql`select x.id, x.pet_id, x.value, x.recorded_at::text, p.name as pet_name
            from weight_records x join pets p on p.id = x.pet_id
           where x.pet_id = any(${sql.param(ids)}::uuid[])
           order by x.recorded_at desc limit 5`,
    ),
  ]);

  const items = [
    ...vacunas.map((row) => ({
      id: `vac-${row.id}`,
      titulo: row.vaccine_name,
      detalle: `${row.pet_name ?? "Mascota"} · vacuna`,
      fecha: row.applied_at,
      href: `/mascotas/${row.pet_id}/vacunas`,
    })),
    ...antiparasitarios.map((row) => ({
      id: `des-${row.id}`,
      titulo: row.product_name,
      detalle: `${row.pet_name ?? "Mascota"} · antiparasitario`,
      fecha: row.applied_at,
      href: `/mascotas/${row.pet_id}/antiparasitarios`,
    })),
    ...pesos.map((row) => ({
      id: `pes-${row.id}`,
      titulo: "Control de peso",
      detalle: `${row.pet_name ?? "Mascota"} · ${row.value} kg`,
      fecha: row.recorded_at,
      href: `/mascotas/${row.pet_id}/peso`,
    })),
  ];

  return items.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 3);
}

/** Documentos de todas sus mascotas, para la pantalla de Documentos. */
export async function listMyDocuments(): Promise<PetDocument[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const data = await query<Tables<"pet_documents">>(
    getDb(),
    sql`select * from pet_documents
         where pet_id in (select id from pets where ${myPetScope(user.id)})
         order by date desc`,
  );

  return data.map(toPetDocument);
}

/**
 * Cómo se muestra cada nivel de acceso, granted o invitado por igual.
 * Exportado para que `sharePetAccess` (`pets-actions.ts`) arme el
 * `permisoEtiqueta` del correo de invitación con la misma fuente que ya usa
 * esta pantalla, en vez de duplicar el mapeo.
 */
const ETIQUETA_PERMISO: Record<string, string> = {
  owner: "Codueño/a",
  edit: "Puede ver y cargar",
  view: "Solo lectura",
};

/** Con quién está compartida una mascota. */
export type SharedAccess = {
  id: string;
  nombre: string;
  email: string;
  mascota: string;
  /** Hace falta para revocar: la política de baja se comprueba por mascota. */
  petId: string;
  /**
   * Id de la cuenta invitada — solo en un acceso ya otorgado (`grant`). Una
   * invitación pendiente (`invite`) todavía no tiene cuenta, así que no hay
   * id que exponer: agrupar por persona cae ahí al email, que es el único
   * identificador que existe en ese punto.
   */
  userId?: string;
  permiso: string;
  /**
   * El mismo permiso que `permiso`, pero sin traducir. `permiso` es para
   * leerlo; este es para compararlo y para preseleccionar el `<option>` del
   * selector — que necesita el valor del enum, no "Codueño/a".
   */
  permission: Permiso;
  /**
   * No se renderiza — solo dice de qué tabla salió la fila para que el botón
   * de revocar llame a `revokePetAccess` o a `revokePetShareInvite`, y para
   * que cambiar el permiso sepa cuál de las dos tablas actualizar. Una
   * invitación pendiente se ve exactamente igual que un acceso ya otorgado:
   * ninguna marca visible los distingue.
   */
  kind: "grant" | "invite";
};

/**
 * Con quién comparte sus mascotas — accesos ya otorgados e invitaciones
 * todavía pendientes, mezclados sin ninguna marca que los distinga.
 *
 * El email de un acceso otorgado no está en `profiles` sino en `auth.users`,
 * que no es consultable con la sesión de nadie: se resuelve con la clave de
 * servicio. El de una invitación pendiente sí está en la propia fila de
 * `pet_share_invites` — es el dato con el que se invitó, y ahí no hace falta
 * ninguna cuenta para tenerlo.
 *
 * Una invitación ya rechazada no entra a esta lista: mostrarla sería, en sí
 * mismo, una marca visible de que la otra rama corrió. La reinvitación de un
 * email rechazado tiene su propio flujo de confirmación en `sharePetAccess`.
 */
export async function listMySharedAccess(): Promise<SharedAccess[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const db = getDb();

  // Desde la 035 toda mascota tiene una fila propia en pet_shared_access
  // (permission='owner', shared_with_id = quien la creó): se excluye la
  // propia. Solo mascotas de las que el usuario es dueño.
  const [accesos, invitaciones] = await Promise.all([
    query<{
      id: string;
      permission: Permiso;
      pet_id: string;
      shared_with_id: string;
      pet_name: string | null;
    }>(
      db,
      sql`select a.id, a.permission, a.pet_id, a.shared_with_id, p.name as pet_name
            from pet_shared_access a join pets p on p.id = a.pet_id
           where a.shared_with_id <> ${user.id} and ${iOwnPet(user.id, "a.pet_id")}
           order by a.created_at`,
    ),
    // Solo las que mandó esta persona, pendientes y sin vencer.
    query<{
      id: string;
      pet_id: string;
      pet_name: string;
      invited_email: string;
      permission: Permiso;
    }>(
      db,
      sql`select id, pet_id, pet_name, invited_email, permission
            from pet_share_invites
           where status = 'pending' and invited_by = ${user.id}
             and expires_at > now()
           order by created_at`,
    ),
  ]);

  const personas = await personasById(accesos.map((row) => row.shared_with_id));

  const filasOtorgadas: SharedAccess[] = accesos.map((row) => {
    const persona = personas.get(row.shared_with_id);

    return {
      id: row.id,
      nombre: persona?.nombre || "Sin nombre",
      email: persona?.email ?? "",
      mascota: row.pet_name ?? "",
      petId: row.pet_id,
      userId: row.shared_with_id,
      permiso: ETIQUETA_PERMISO[row.permission] ?? "Solo lectura",
      permission: row.permission,
      kind: "grant",
    };
  });

  /**
   * De dónde salían las filas repetidas.
   *
   * Se invita por email a alguien que todavía no tiene cuenta: queda una fila
   * en `pet_share_invites` con estado `pending`. Después esa persona se crea la
   * cuenta, y el dueño le vuelve a compartir la mascota. Ahora `sharePetAccess`
   * **sí encuentra su perfil**, así que toma la otra rama: escribe el acceso
   * directo en `pet_shared_access` y no toca la invitación vieja — que se queda
   * en `pending` para siempre, porque ya nadie la va a aceptar: el acceso está
   * dado.
   *
   * Resultado: la misma persona, para la misma mascota, aparecía dos veces.
   *
   * Se resta acá y no se borra la fila: esta consulta es de lectura, y la
   * invitación sigue siendo el registro de que esa invitación existió. Limpiarla
   * es trabajo de `sharePetAccess`, que es quien crea la situación.
   *
   * Desde que `sharePetAccess` fusionó sus dos ramas en una sola invitación
   * (slice de consentimiento), ya no puede volver a pasar: no queda ninguna
   * rama que escriba en `pet_shared_access` sin que medie una aceptación. Esta
   * resta queda como defensa legacy, para los duplicados que ya existían antes
   * del cambio.
   */
  const yaTienenAcceso = new Set(
    filasOtorgadas
      .filter((fila) => fila.email)
      .map((fila) => `${fila.petId}|${fila.email.toLowerCase()}`),
  );

  const filasInvitadas: SharedAccess[] = invitaciones
    .filter(
      (row) =>
        !yaTienenAcceso.has(`${row.pet_id}|${row.invited_email.toLowerCase()}`),
    )
    .map((row) => ({
      id: row.id,
      // Sin cuenta todavía: el mismo "Sin nombre" que ya se muestra arriba
      // para una cuenta sin nombre cargado.
      nombre: "Sin nombre",
      email: row.invited_email,
      mascota: row.pet_name,
      petId: row.pet_id,
      permiso: ETIQUETA_PERMISO[row.permission] ?? "Solo lectura",
      permission: row.permission,
      kind: "invite",
    }));

  return [...filasOtorgadas, ...filasInvitadas];
}

/** Una persona con acceso a una mascota, vista desde la ficha de esa mascota. */
type PetAccessPerson = {
  /** El id de la fila de `pet_shared_access`, no el de la persona. */
  id: string;
  nombre: string;
  email: string;
  permiso: string;
  /** Para señalar cuál de la lista es quien está mirando. */
  esVos: boolean;
};

export type PetAccess = {
  personas: PetAccessPerson[];
  /**
   * Si quien mira no es el `owner_id` de la mascota, esta lista NO está
   * completa — ver abajo. La pantalla tiene que poder decirlo.
   */
  listaCompleta: boolean;
};

/**
 * Quiénes tienen acceso a una mascota. Solo lectura: gestionar los accesos
 * sigue viviendo en Perfil, que es donde están las acciones.
 *
 * **La lista puede venir incompleta, y no es un error.** `shared_access_select`
 * (005) deja ver una fila si `shared_with_id = auth.uid() OR
 * is_pet_owner(pet_id)`. Y `is_pet_owner` **no** es solo la dueña registral: la
 * 035 lo redefinió con `CREATE OR REPLACE` para incluir también a quien tenga
 * una fila con `permission = 'owner'`. Leer la definición de la 005 sin buscar
 * si una migración posterior la reemplazó lleva justo a la conclusión
 * equivocada.
 *
 * Entonces la lista viene completa para la dueña registral y para cualquier
 * codueño de nivel `owner`; viene recortada a su propia fila para quien tenga
 * `view` o `edit`.
 *
 * A ese último, mostrarle una lista de uno sin aclarar nada sería peor que no
 * mostrar nada: leería "acá está quién tiene acceso" y concluiría que es el
 * único. Por eso se devuelve `listaCompleta` y la tarjeta cambia de texto, en
 * vez de fingir que la consulta vio todo.
 *
 * Las invitaciones todavía sin aceptar quedan afuera a propósito: quien no
 * aceptó no tiene acceso, y esta tarjeta contesta quién lo tiene hoy.
 */
export async function listPetAccess(petId: string): Promise<PetAccess> {
  const user = await getCurrentUser();
  if (!user) return { personas: [], listaCompleta: false };

  const db = getDb();
  const [[mascota], todos] = await Promise.all([
    query<{ owner_id: string }>(
      db,
      sql`select owner_id from pets where id = ${petId}`,
    ),
    query<{ id: string; permission: Permiso; shared_with_id: string }>(
      db,
      sql`select id, permission, shared_with_id from pet_shared_access
           where pet_id = ${petId} order by created_at`,
    ),
  ]);

  // La dueña registral y los codueños `owner` ven la lista completa; el resto
  // solo su propia fila (lo que antes decidía `shared_access_select`).
  const miFila = todos.find((row) => row.shared_with_id === user.id);
  const listaCompleta =
    mascota?.owner_id === user.id || miFila?.permission === "owner";
  const accesos = listaCompleta ? todos : miFila ? [miFila] : [];

  const personas = await personasById(accesos.map((row) => row.shared_with_id));

  return {
    listaCompleta,
    personas: accesos.map((row) => {
      const persona = personas.get(row.shared_with_id);

      return {
        id: row.id,
        nombre: persona?.nombre || "Sin nombre",
        email: persona?.email ?? "",
        permiso: ETIQUETA_PERMISO[row.permission] ?? "Solo lectura",
        esVos: row.shared_with_id === user.id,
      };
    }),
  };
}

/** Un email con acceso vigente a una mascota, para el chequeo de idempotencia de `sharePetAccess`. */
export type PetAccessEmail = { email: string; permission: Permiso };

/**
 * Emails con acceso vigente a UNA mascota — nunca "¿esta dirección tiene
 * cuenta en algún lado?". Lee `pet_shared_access` bajo el brazo de dueño de
 * `shared_access_select` (005/035), sobre las filas de la mascota que el
 * dueño ya puede listar en pantalla; una dirección sin acceso simplemente no
 * está en el resultado y no hay forma de preguntar por ella. Esa dirección de
 * la resolución —id de esta mascota hacia email, nunca email hacia cuenta— es
 * lo que la distingue de un lookup como el que tenía `findProfileIdByEmail`
 *.
 */
export async function listPetAccessEmails(
  petId: string,
): Promise<PetAccessEmail[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  // Solo el dueño de la mascota puede listar sus accesos.
  const accesos = await query<{ shared_with_id: string; permission: Permiso }>(
    getDb(),
    sql`select shared_with_id, permission from pet_shared_access
         where pet_id = ${petId} and ${iOwnPet(user.id, "pet_id")}`,
  );

  if (!accesos.length) return [];

  const personas = await personasById(accesos.map((row) => row.shared_with_id));

  return accesos
    .map((row) => ({
      email: personas.get(row.shared_with_id)?.email ?? "",
      permission: row.permission,
    }))
    .filter((row) => row.email);
}

/**
 * Email de la persona detrás de UN acceso ya otorgado. Existe para poder
 * reinvitarla con más permiso sin que el navegador tenga que mandar la
 * dirección de vuelta.
 *
 * Misma dirección de resolución que `listPetAccessEmails`, y por el mismo
 * motivo: se parte del id de una fila de acceso —que solo el dueño de esa
 * mascota puede leer, `shared_access_select` (005/035)— y se llega al email.
 * Nunca al revés. Una dirección sin acceso a esta mascota no es alcanzable
 * desde acá, así que esto no puede contestar "¿este email tiene cuenta?"
 *.
 *
 * `null` cuando RLS esconde la fila o la cuenta ya no existe. Quien llama
 * tiene que tratarlo como "no se pudo": pasarle una cadena vacía a
 * `sharePetAccess` crearía una invitación a nadie.
 */
export async function emailDeAccesoCompartido(
  accessId: string,
): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const [acceso] = await query<{ shared_with_id: string }>(
    getDb(),
    sql`select shared_with_id from pet_shared_access
         where id = ${accessId} and ${iOwnPet(user.id, "pet_id")}`,
  );

  if (!acceso) return null;

  const personas = await personasById([acceso.shared_with_id]);

  return personas.get(acceso.shared_with_id)?.email || null;
}

/** Una invitación pendiente, vista desde quien la recibió. */
export type PendingPetInvite = {
  id: string;
  mascota: string;
  invitadoPor: string;
  permiso: string;
  venceEl: string;
};

/**
 * Invitaciones pendientes dirigidas al email confirmado de quien pide —
 * lado del invitado, no del dueño.
 *
 * El WHERE de acá abajo (pending, no vencida, `invited_email` propio) es
 * intencional y no un adorno: RLS (`pet_share_invites_select`, migración
 * 045) ya lo exige para el brazo del invitado, pero esa misma política
 * también deja pasar, por su otro brazo (`is_pet_owner(pet_id)`), las
 * invitaciones que la sesión mandó como dueña de una mascota — sin este
 * WHERE, alguien que ya es dueño de mascotas y además tiene una invitación
 * propia pendiente vería su propia invitación saliente mezclada acá adentro.
 * Hoy el único llamador es `/onboarding/dueno`, con una sesión recién
 * registrada que todavía no es dueña de nada, así que en la práctica nunca
 * pasaba — pero esta función no debería depender de que quien la llame
 * sea, siempre, alguien sin mascotas.
 */
export const listMyPendingPetInvites = cache(listMyPendingPetInvitesSinCache);

/**
 * `cache` porque ahora la piden dos lugares en el mismo render: el layout del
 * dueño (la campana) y `/inicio` (la tarjeta). Es la misma función, una sola
 * fuente de verdad para "qué invitaciones tengo pendientes", y una sola
 * consulta por request.
 */
async function listMyPendingPetInvitesSinCache(): Promise<PendingPetInvite[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const data = await query<{
    id: string;
    pet_name: string;
    inviter_name: string;
    permission: string;
    expires_at: string;
  }>(
    getDb(),
    sql`select id, pet_name, inviter_name, permission, expires_at
          from pet_share_invites
         where status = 'pending' and invited_email = ${user.email.toLowerCase()}
           and expires_at > now()
         order by created_at`,
  );

  return data.map((row) => ({
    id: row.id,
    mascota: row.pet_name,
    invitadoPor: row.inviter_name,
    permiso: ETIQUETA_PERMISO[row.permission] ?? "Solo lectura",
    venceEl: row.expires_at,
  }));
}

type Persona = { nombre: string; email: string };

/**
 * Nombre y email de las personas con las que se comparte, resueltos con la
 * clave de servicio. Los dos datos hacen falta, y por motivos distintos.
 *
 * El email vive en `auth.users`, que no es consultable con la sesión de nadie.
 * Eso ya se sabía.
 *
 * El nombre vive en `profiles`, que sí lo es — pero su política de SELECT (001)
 * solo deja leer **la fila propia**. Un dueño no tiene ninguna política que le
 * permita leer el perfil de la persona con la que comparte su mascota. Por eso
 * el `profiles:shared_with_id(...)` que había acá devolvía NULL en todas las
 * filas y la lista entera decía "Sin nombre": cuando RLS le esconde un recurso
 * embebido, PostgREST no falla — lo devuelve vacío. Un JOIN correcto que no
 * trae nada se lee exactamente igual que un JOIN que falta, y ahí estuvo la
 * confusión.
 *
 * Se resuelve con la clave de servicio y no con una política nueva a propósito:
 * abrir `profiles` a terceros amplía la superficie de lectura de datos
 * personales de toda la aplicación para arreglar una pantalla. El dato que se
 * expone es el mismo que ya se mostraba —el nombre de alguien a quien vos
 * invitaste— pero lo decide este código, acotado a esta consulta.
 */
async function personasById(ids: string[]) {
  const unicos = [...new Set(ids)];
  const personas = new Map<string, Persona>();
  if (unicos.length === 0) return personas;

  const filas = await query<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>(
    getDb(),
    sql`select u.id, p.first_name, p.last_name, u.email
          from auth.users u left join profiles p on p.id = u.id
         where u.id = any(${sql.param(unicos)}::uuid[])`,
  );

  for (const fila of filas) {
    personas.set(fila.id, {
      nombre: [fila.first_name, fila.last_name].filter(Boolean).join(" "),
      email: fila.email ?? "",
    });
  }

  return personas;
}

export type PetSearchResult = {
  id: string;
  nombre: string;
  raza?: string;
  fotoUrl?: string;
};

const MAX_PET_SEARCH_RESULTS = 8;

/**
 * Busca entre las mascotas del dueño autenticado, sin distinguir mayúsculas.
 *
 * Acota por `myPetScope` (propias + compartidas): la mascota activa de la sesión es una
 * preferencia de pantalla, no un criterio de búsqueda — buscar "raquel"
 * estando en Lolo tiene que encontrar a Raquel.
 */
export async function searchMyPets(
  busqueda: string,
): Promise<PetSearchResult[]> {
  const texto = busqueda.trim();
  if (!texto) return [];

  const user = await getCurrentUser();
  if (!user) return [];

  // `%` y `_` son comodines de LIKE: sin escaparlos, buscar "_" devuelve todo.
  const escapado = texto.replace(/[\\%_]/g, "\\$&");

  const data = await query<{
    id: string;
    name: string;
    breed: string | null;
    photo_url: string | null;
  }>(
    getDb(),
    sql`select id, name, breed, photo_url from pets
         where ${myPetScope(user.id)} and name ilike ${`%${escapado}%`}
         order by name limit ${MAX_PET_SEARCH_RESULTS}`,
  );

  return data.map((row) => ({
    id: row.id,
    nombre: row.name,
    raza: row.breed ?? undefined,
    fotoUrl: row.photo_url ?? undefined,
  }));
}
