"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/features/auth/lib/current-user";
import {
  emailDeAccesoCompartido,
  listPetAccessEmails,
} from "@/features/owner/data/owner-queries";
import { toDbSex, toDbSpecies } from "@/features/owner/lib/mappers";
import { rangoPermiso, type Permiso } from "@/features/owner/lib/permissions";
import {
  type LegadoMascota,
  crearPetServerSchema,
  normalizarMicrochip,
} from "@/features/owner/schemas/pet-schema";
import { borrarArchivosDeMascotas } from "@/features/owner/lib/pet-storage";
import {
  parseQrPublicConfig,
  qrPublicConfigPatchSchema,
  type QrPublicConfig,
  type QrPublicConfigPatch,
} from "@/features/public-qr/lib/qr-public-config";
import { generateUniqueQrCode } from "@/lib/qr-code";
import { dbError, getDb, query, withUser } from "@/lib/db";
import type { Sex, Species } from "@/types/pet";

/**
 * Acciones sobre la mascota.
 *
 * La base no aplica RLS para la conexión de la app: cada escritura corre con
 * `withUser` y se acota con `has_pet_access()`/`is_pet_owner()` (las mismas
 * funciones que usaban las políticas). `owner_id` y `created_by_id` salen de
 * la sesión, nunca del formulario.
 */
export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string };

const GENERIC_ERROR = "No pudimos guardar los cambios. Probá de nuevo.";

/** La unicidad se consulta contra el histórico: ahí están también los dados de baja. */
async function qrCodeLibre() {
  return generateUniqueQrCode(async (code) => {
    const filas = await query(
      getDb(),
      sql`select id from pet_qr_codes where code = ${code} limit 1`,
    );
    return filas.length > 0;
  });
}

export type PetInput = {
  nombre: string;
  especie: Species;
  raza?: string;
  sexo?: Sex;
  fechaNacimiento?: string;
  pesoKg?: number;
  color?: string;
  castrado?: boolean;
  microchip?: string;
  tipoSangre?: string;
};

/**
 * `photo_url` no se toca acá a propósito: la foto la suben y la borran
 * `uploadPetPhoto`/`removePetPhoto` (`photo-actions.ts`), nunca el guardado de
 * los demás datos. Escribirla acá con un valor que el formulario no colecta
 * la pisaría a NULL en cada "Guardar", aunque nadie hubiera tocado la foto.
 */
function toRow(input: PetInput) {
  return {
    name: input.nombre.trim(),
    species: toDbSpecies(input.especie),
    breed: input.raza?.trim() || null,
    sex: input.sexo ? toDbSex(input.sexo) : null,
    date_of_birth: input.fechaNacimiento || null,
    weight: input.pesoKg ?? null,
    color: input.color?.trim() || null,
    neutered: input.castrado ?? false,
    microchip_number: normalizarMicrochip(input.microchip) || null,
    blood_type: input.tipoSangre?.trim() || null,
  };
}

/**
 * Revalida en el servidor con los validadores del formulario. La acción es un
 * endpoint público: el `zodResolver` del navegador es UX, no una garantía. El
 * error es el primer mensaje del schema, en el mismo `ActionResult` de siempre.
 */
function validarMascota(
  input: PetInput,
  legado?: LegadoMascota,
):
  | { ok: true; data: PetInput }
  | { ok: false; error: string; soloChipOSangre: boolean } {
  const parsed = crearPetServerSchema(legado).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      soloChipOSangre: parsed.error.issues.every(
        (issue) =>
          issue.path[0] === "microchip" || issue.path[0] === "tipoSangre",
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

export async function createPet(
  rawInput: PetInput,
): Promise<ActionResult<{ petId: string }>> {
  const user = await requireUser();

  const validacion = validarMascota(rawInput);
  if (!validacion.ok) return { success: false, error: validacion.error };
  const input = validacion.data;
  const qrCode = await qrCodeLibre();
  const row = toRow(input);

  let petId: string;
  try {
    petId = await withUser(user.id, async (tx) => {
      const [creada] = await query<{ id: string }>(
        tx,
        sql`insert into pets (name, species, breed, sex, date_of_birth, weight,
              color, neutered, microchip_number, blood_type, owner_id, qr_code)
            values (${row.name}, ${row.species}, ${row.breed}, ${row.sex},
              ${row.date_of_birth}, ${row.weight}, ${row.color}, ${row.neutered},
              ${row.microchip_number}, ${row.blood_type}, ${user.id}, ${qrCode})
            returning id`,
      );

      // El peso inicial también es un punto del gráfico.
      if (input.pesoKg) {
        await tx.execute(sql`
          insert into weight_records (pet_id, value, source, created_by_id)
          values (${creada.id}, ${input.pesoKg}, 'owner', ${user.id})`);
      }
      return creada.id;
    });
  } catch (error) {
    console.error("createPet", error);
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath("/mis-mascotas");
  revalidatePath("/inicio");

  return { success: true, petId };
}

export async function updatePet(
  petId: string,
  rawInput: PetInput,
): Promise<ActionResult> {
  const user = await requireUser();

  let validacion = validarMascota(rawInput);

  // Si lo único que falla es el microchip o el tipo de sangre, puede ser una
  // ficha vieja (chip de menos de 15 dígitos, sangre escrita a mano) que se
  // edita por otro campo. Esos valores se aceptan si llegan SIN CAMBIOS: se
  // leen de la fila actual (con RLS) y se revalida contra ellos.
  if (!validacion.ok && validacion.soloChipOSangre) {
    const [actual] = await query<{
      microchip_number: string | null;
      blood_type: string | null;
    }>(
      getDb(),
      sql`select microchip_number, blood_type from pets where id = ${petId}`,
    );

    if (actual) {
      validacion = validarMascota(rawInput, {
        microchip: actual.microchip_number,
        tipoSangre: actual.blood_type,
      });
    }
  }

  if (!validacion.ok) return { success: false, error: validacion.error };
  const input = validacion.data;

  // Solo el dueño o quien tenga acceso compartido de edición.
  const row = toRow(input);
  let actualizada: unknown;
  try {
    [actualizada] = await withUser(user.id, (tx) =>
      query(
        tx,
        sql`update pets set name = ${row.name}, species = ${row.species},
              breed = ${row.breed}, sex = ${row.sex},
              date_of_birth = ${row.date_of_birth}, weight = ${row.weight},
              color = ${row.color}, neutered = ${row.neutered},
              microchip_number = ${row.microchip_number},
              blood_type = ${row.blood_type}
            where id = ${petId} and has_pet_access(id, 'edit')
            returning id`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  if (!actualizada) {
    return {
      success: false,
      error: "No tenés permiso para editar los datos de esta mascota.",
    };
  }

  revalidatePath(`/mascotas/${petId}`, "layout");
  revalidatePath("/mis-mascotas");

  return { success: true };
}

export async function deletePet(petId: string): Promise<ActionResult> {
  const user = await requireUser();

  // Solo el dueño (o un codueño `owner`) puede borrarla.
  let borrada: unknown;
  try {
    [borrada] = await withUser(user.id, (tx) =>
      query(
        tx,
        sql`delete from pets where id = ${petId} and is_pet_owner(id) returning id`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  if (!borrada) {
    return {
      success: false,
      error: "Solo el dueño de la mascota puede eliminarla.",
    };
  }

  // Después de borrar la fila, y nunca antes.
  await borrarArchivosDeMascotas([petId]);

  revalidatePath("/mis-mascotas");
  revalidatePath("/inicio");

  return { success: true };
}

/**
 * Da de baja el collar viejo y emite uno nuevo.
 *
 * Es una acción de privacidad, no de mantenimiento: se usa cuando el collar se
 * perdió o lo tiene alguien que no debería. El código anterior queda registrado
 * como revocado —lo hace el trigger `pets_track_qr_code`— para que quien escanee
 * la chapita vieja lea que fue dada de baja en vez de "mascota no encontrada".
 */
export async function regeneratePetQrCode(
  petId: string,
): Promise<ActionResult<{ qrCode: string }>> {
  const user = await requireUser();
  const qrCode = await qrCodeLibre();

  let data: unknown;
  try {
    [data] = await withUser(user.id, (tx) =>
      query(
        tx,
        sql`update pets set qr_code = ${qrCode}
             where id = ${petId} and has_pet_access(id, 'edit') returning id`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }
  if (!data) {
    return {
      success: false,
      error: "No tenés permiso para modificar el collar de esta mascota.",
    };
  }

  revalidatePath(`/mascotas/${petId}/qr`);

  return { success: true, qrCode };
}

/**
 * Qué se muestra en la ficha pública del collar (`/p/[code]`).
 *
 * Recibe un cambio parcial y lo mezcla con lo guardado: tocar la foto no
 * resetea ninguna otra clave. Puede el dueño y quien tenga acceso compartido
 * de edición, igual que el resto de los datos de la mascota.
 */
export async function updateQrConfig(
  petId: string,
  patch: QrPublicConfigPatch,
): Promise<ActionResult<{ config: QrPublicConfig }>> {
  const user = await requireUser();

  const id = z.guid().safeParse(petId);
  const cambio = qrPublicConfigPatchSchema.safeParse(patch);
  if (!id.success || !cambio.success) {
    return { success: false, error: "Los datos enviados no son válidos." };
  }

  const [actual] = await query<{ qr_code: string; qr_public_config: unknown }>(
    getDb(),
    sql`select qr_code, qr_public_config from pets where id = ${id.data}`,
  );

  if (!actual) {
    return { success: false, error: "No encontramos esa mascota." };
  }

  // Se guarda la configuración completa ya parseada: las filas viejas pasan a
  // tener todas las claves, con los mismos valores que ya se veían.
  const config: QrPublicConfig = {
    ...parseQrPublicConfig(actual.qr_public_config),
    ...cambio.data,
  };

  let guardada: unknown[];
  try {
    guardada = await withUser(user.id, (tx) =>
      query(
        tx,
        sql`update pets set qr_public_config = ${JSON.stringify(config)}::jsonb
             where id = ${id.data} and has_pet_access(id, 'edit') returning id`,
      ),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }
  if (!guardada.length) {
    return {
      success: false,
      error: "No tenés permiso para cambiar la privacidad de esta mascota.",
    };
  }

  revalidatePath(`/mascotas/${id.data}/qr`);
  revalidatePath(`/p/${actual.qr_code}`);

  return { success: true, config };
}

// -------------------------------------------------------------------- perfil

/**
 * Datos personales de quien tiene la sesión.
 *
 * El email no se toca acá: cambiarlo es una operación de autenticación, manda un
 * correo de confirmación a la dirección nueva y hasta que se confirme la sesión
 * sigue con la vieja. Mezclarlo con "guardar mi teléfono" haría que un cambio de
 * dirección postal dispare un mail de verificación.
 *
 * El rol tampoco: lo protege un trigger en la base (migración 001).
 */
export async function updateProfile(input: {
  nombre: string;
  apellido: string;
  telefono?: string;
  direccion?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!input.nombre.trim() || !input.apellido.trim()) {
    return {
      success: false,
      error: "El nombre y el apellido son obligatorios.",
    };
  }

  try {
    await withUser(user.id, (tx) =>
      tx.execute(sql`
        update profiles set
          first_name = ${input.nombre.trim()},
          last_name = ${input.apellido.trim()},
          phone = ${input.telefono?.trim() || null},
          address = ${input.direccion?.trim() || null}
        where id = ${user.id}`),
    );
  } catch {
    return { success: false, error: GENERIC_ERROR };
  }

  revalidatePath("/", "layout");

  return { success: true };
}

// ------------------------------------------------------- accesos compartidos

/**
 * El trigger `protect_last_pet_owner` (035) frena en la base que una mascota
 * se quede sin ningún dueño. Sin este mapeo, esa protección real le llegaría a
 * quien la dispara como el genérico "no pudimos guardar" — el mensaje que sí
 * explica qué pasó se pierde en el camino.
 */
function traducirError(error: unknown): string {
  const { message } = dbError(error);
  if (message.includes("al menos un dueño")) {
    return "No podés sacarle o bajarle el nivel al último dueño de una mascota.";
  }
  return GENERIC_ERROR;
}

/**
 * Resultado de `sharePetAccess`, y solo de esa acción: ni `requiresConfirmation`
 * ni `yaTeniaAcceso` encajan en el `ActionResult<T>` compartido (usado por el
 * resto de las acciones de este archivo y de otros) sin ensancharlo con campos
 * que ningún otro llamador necesita.
 *
 * `yaTeniaAcceso` es `success: true` a propósito, no un error: el modal
 * comparte "todas mis mascotas" en un bucle (`share-pet-access-modal.tsx`) y
 * antes abortaba todo el bucle ante el primer resultado sin éxito. Un `false`
 * acá cortaría de compartir las mascotas 2..N solo porque la 1 ya tenía
 * acceso. Con `success: true` el modal cuenta cuántas se saltearon y sigue.
 */
type ShareResult =
  | { success: true; yaTeniaAcceso?: true }
  | { success: false; error: string; requiresConfirmation?: boolean };

/** Cuánto vive una invitación pendiente antes de dejar de poder aceptarse. */
const INVITE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Comparte una mascota por email: siempre crea una invitación pendiente en
 * `pet_share_invites` (migración 045), tenga cuenta el destinatario o no.
 * Nadie obtiene acceso sin haberla aceptado — la rama que otorgaba
 * `pet_shared_access` al instante cuando el email ya tenía cuenta
 * (`findProfileIdByEmail` + upsert directo) queda eliminada por completo, y
 * con ella el oráculo de existencia de cuenta que esa rama exponía.
 *
 * Sobreviven dos guards, y los dos son idempotencia de aplicación, no
 * autorización: saltearlos como mucho crea una invitación redundante, nunca
 * otorga acceso.
 *
 * - Auto-invitación: se compara el email tipeado contra el email de la propia
 *   sesión, ambos normalizados igual que la columna (`invited_email =
 *   lower(invited_email)`, 045) — sin resolver a ninguna cuenta.
 * - Acceso igual o mayor: lo que blinda esto no es evitar resolver emails,
 *   sino la DIRECCIÓN de esa resolución. `listPetAccessEmails(petId)` va de
 *   id a email sobre las propias filas de acceso de ESTA mascota — datos que
 *   quien comparte ya puede listar en pantalla. Una dirección sin acceso
 *   simplemente no está en ese resultado: no hay forma de preguntar por ella.
 *   Es lo que distingue esto de `findProfileIdByEmail`, que iba de email a
 *   cuenta y podía contestar sobre cualquier dirección del mundo.
 *
 * `forceResend` sigue siendo lo único que hace que un reintento cambie de
 * resultado, y ahora cubre dos casos, los dos por el mismo criterio: reenviar
 * un correo que la otra persona ya recibió no se hace en silencio. Uno es
 * reinvitar a un email que rechazó la invitación anterior para esta mascota
 * (el dueño confirma la intención cada vez, sin cooldown por tiempo); el otro es reinvitar a uno que
 * todavía tiene una invitación vigente sin responder, detallado más abajo.
 *
 * Los correos (`enviarEmailsDeInvitacion`, más arriba) salen recién después
 * de que la fila de la invitación ya quedó escrita: si el envío falla, la
 * invitación sigue siendo válida, nunca al revés.
 */
export async function sharePetAccess(
  petId: string,
  email: string,
  permission: "view" | "edit" | "owner" = "view",
  forceResend = false,
): Promise<ShareResult> {
  const user = await requireUser();
  const destinatarioEmail = email.trim().toLowerCase();

  if (destinatarioEmail === user.email.trim().toLowerCase()) {
    return { success: false, error: "Esa mascota ya es tuya." };
  }

  const accesosActuales = await listPetAccessEmails(petId);
  const yaTieneAcceso = accesosActuales.some(
    (acceso) =>
      acceso.email.toLowerCase() === destinatarioEmail &&
      rangoPermiso(acceso.permission) >= rangoPermiso(permission),
  );

  if (yaTieneAcceso) {
    return { success: true, yaTeniaAcceso: true };
  }

  const db = getDb();
  const [mascota] = await query<{ name: string }>(
    db,
    sql`select name from pets where id = ${petId}`,
  );
  const petNombre = mascota?.name ?? "tu mascota";

  const [invitacionExistente] = await query<{
    status: string;
    expires_at: string;
  }>(
    db,
    sql`select status, expires_at from pet_share_invites
         where pet_id = ${petId} and invited_email = ${destinatarioEmail}`,
  );

  if (invitacionExistente?.status === "declined" && !forceResend) {
    return {
      success: false,
      error:
        "Esta persona ya había rechazado una invitación anterior para esta mascota. Confirmá para volver a invitarla.",
      requiresConfirmation: true,
    };
  }

  /**
   * Reinvitar a alguien que ya tiene una invitación pendiente.
   *
   * La fila duplicada nunca fue posible: el `UNIQUE (pet_id, invited_email)`
   * de la 045 la impide, y el `upsert` de más abajo la pisa. El problema es lo
   * que esa pisada arrastra sin que nadie lo pida — se vuelven a disparar los
   * dos correos y la notificación in-app, y `expires_at` se corre otros treinta
   * días. Desde la pantalla se ve como si no hubiera pasado nada, mientras del
   * otro lado llega el mismo correo por segunda vez.
   *
   * Se pide confirmación en vez de rechazar de plano porque reenviar es un
   * caso legítimo y frecuente: la invitación se fue a spam y la persona nunca
   * la vio. Bloquear duro dejaría al dueño sin ninguna salida más que revocar
   * y volver a empezar.
   *
   * Solo cuenta la invitación VIGENTE. Una pendiente ya vencida no se puede
   * aceptar (`pet_share_invites_select`, 045, exige `expires_at > now()`), así
   * que volver a mandarla no duplica nada: es la única forma de revivirla, y
   * pedir confirmación para eso sería fricción sobre el camino correcto.
   */
  const pendienteVigente =
    invitacionExistente?.status === "pending" &&
    new Date(invitacionExistente.expires_at) > new Date();

  if (pendienteVigente && !forceResend) {
    return {
      success: false,
      error:
        "Esta persona ya tiene una invitación pendiente para esta mascota. Confirmá para volver a enviársela.",
      requiresConfirmation: true,
    };
  }

  // Solo un dueño de la mascota puede invitar.
  let invitacion: unknown;
  try {
    [invitacion] = await withUser(user.id, (tx) =>
      query(
        tx,
        sql`insert into pet_share_invites (pet_id, invited_email, permission,
              status, pet_name, inviter_name, invited_by, expires_at, responded_at)
            select ${petId}, ${destinatarioEmail}, ${permission}::share_permission,
              'pending', ${petNombre}, ${`${user.nombre} ${user.apellido}`.trim()},
              ${user.id}, ${new Date(Date.now() + INVITE_EXPIRY_MS).toISOString()}::timestamptz,
              null
             where is_pet_owner(${petId})
            on conflict (pet_id, invited_email) do update set
              permission = excluded.permission,
              status = 'pending',
              pet_name = excluded.pet_name,
              inviter_name = excluded.inviter_name,
              invited_by = excluded.invited_by,
              expires_at = excluded.expires_at,
              responded_at = null
            returning id`,
      ),
    );
  } catch (error) {
    return { success: false, error: traducirError(error) };
  }
  if (!invitacion) return { success: false, error: GENERIC_ERROR };

  // Sin proveedor de correo: la invitación se acepta desde el perfil.

  revalidatePath(`/mascotas/${petId}`, "layout");

  return { success: true };
}

export async function revokePetAccess(
  accessId: string,
  petId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  // Solo un dueño de la mascota revoca accesos.
  let data: unknown[];
  try {
    data = await withUser(user.id, (tx) =>
      query(
        tx,
        sql`delete from pet_shared_access
             where id = ${accessId} and is_pet_owner(pet_id) returning id`,
      ),
    );
  } catch (error) {
    return { success: false, error: traducirError(error) };
  }
  if (data.length === 0) return { success: false, error: GENERIC_ERROR };

  revalidatePath(`/mascotas/${petId}`, "layout");

  return { success: true };
}

/**
 * Resultado de `updatePetAccessPermission`. `via` no es decoración: la pantalla
 * tiene que contar dos historias distintas. Una baja ya está aplicada cuando
 * esto vuelve; una suba recién empieza y no cambia nada hasta que la otra
 * persona acepte.
 */
type UpdateAccessResult =
  | { success: true; via: "aplicado" | "invitacion" }
  | { success: false; error: string; requiresConfirmation?: boolean };

/**
 * Cambia el permiso de alguien con quien ya se comparte una mascota.
 *
 * "Editar permisos" es una sola palabra para dos operaciones que no se parecen
 * en nada, y meterlas en el mismo UPDATE es lo que rompería el consentimiento
 * que la 045 salió a construir:
 *
 * - **Bajar** (codueño → solo lectura) le QUITA poder a alguien. Nadie tiene
 *   que consentir que le saquen algo: revocarle el acceso entero ya se podía
 *   de un botón, y bajarlo es estrictamente menos que eso. Se aplica directo.
 * - **Subir** (solo lectura → codueño) le DA poder. Eso es exactamente lo que
 *   `pet-coownership-invite` (spec, "No Invite When the Recipient Already Has
 *   Equal or Greater Access") exige que pase por una invitación nueva: el
 *   acceso viejo no se toca hasta que la acepten. Se delega en
 *   `sharePetAccess`, que es la única puerta de alta que existe.
 *
 * Una **invitación** todavía pendiente es el tercer caso y no es ninguno de
 * los dos: nadie aceptó nada, así que no hay consentimiento que respetar.
 * Cambiarle el permiso es corregir la oferta antes de que la miren, suba o
 * baje. Lo que la persona termina aceptando es lo que ve en pantalla al
 * aceptar (`PendingInvitesList` pinta el permiso), no lo que decía el correo.
 *
 * `forceResend` se propaga tal cual a `sharePetAccess` y sirve para el mismo
 * caso: subir a alguien que ya rechazó o que tiene una invitación vigente
 * exige que el dueño lo confirme, y la confirmación la pide la pantalla.
 */
export async function updatePetAccessPermission(
  accessId: string,
  petId: string,
  kind: "grant" | "invite",
  permission: Permiso,
  forceResend = false,
): Promise<UpdateAccessResult> {
  const user = await requireUser();

  if (kind === "invite") {
    // `.select("id").maybeSingle()`, no solo `error`: un UPDATE que RLS niega
    // afecta cero filas y contesta que salió bien. El `status = 'pending'`
    // además no es redundante con la política — impide reabrir una invitación
    // ya respondida cambiándole el permiso.
    let actualizada: unknown;
    try {
      [actualizada] = await withUser(user.id, (tx) =>
        query(
          tx,
          sql`update pet_share_invites set permission = ${permission}::share_permission
               where id = ${accessId} and status = 'pending'
                 and is_pet_owner(pet_id) returning id`,
        ),
      );
    } catch (error) {
      return { success: false, error: traducirError(error) };
    }
    if (!actualizada) {
      return {
        success: false,
        error: "Esta invitación ya no está pendiente. Actualizá la página.",
      };
    }

    revalidatePath(`/mascotas/${petId}`, "layout");
    revalidatePath("/perfil");

    return { success: true, via: "aplicado" };
  }

  const [acceso] = await withUser(user.id, (tx) =>
    query<{ permission: Permiso }>(
      tx,
      sql`select permission from pet_shared_access
           where id = ${accessId} and is_pet_owner(pet_id)`,
    ),
  );

  if (!acceso) return { success: false, error: GENERIC_ERROR };

  const actual = rangoPermiso(acceso.permission);
  const pedido = rangoPermiso(permission);

  if (pedido === actual) return { success: true, via: "aplicado" };

  if (pedido > actual) {
    // El email no viaja desde el navegador: se resuelve en el servidor a
    // partir del id de la fila de acceso. Un email que llega del formulario
    // es una sugerencia, no un hecho — y acá la sugerencia sería a quién
    // invitar.
    const email = await emailDeAccesoCompartido(accessId);
    if (!email) return { success: false, error: GENERIC_ERROR };

    const resultado = await sharePetAccess(
      petId,
      email,
      permission,
      forceResend,
    );

    if (!resultado.success) {
      return {
        success: false,
        error: resultado.error,
        requiresConfirmation: resultado.requiresConfirmation,
      };
    }

    return { success: true, via: "invitacion" };
  }

  // Baja. El trigger `protect_last_pet_owner` (035) es quien frena degradar al
  // último dueño de la mascota, y `traducirError` ya sabe convertir su mensaje
  // en algo que se entienda.
  let actualizado: unknown;
  try {
    [actualizado] = await withUser(user.id, (tx) =>
      query(
        tx,
        sql`update pet_shared_access set permission = ${permission}::share_permission
             where id = ${accessId} and is_pet_owner(pet_id) returning id`,
      ),
    );
  } catch (error) {
    return { success: false, error: traducirError(error) };
  }
  if (!actualizado) return { success: false, error: GENERIC_ERROR };

  revalidatePath(`/mascotas/${petId}`, "layout");
  revalidatePath("/perfil");

  return { success: true, via: "aplicado" };
}
