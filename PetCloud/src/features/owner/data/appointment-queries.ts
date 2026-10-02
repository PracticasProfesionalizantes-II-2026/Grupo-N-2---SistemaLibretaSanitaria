import "server-only";

import { getCurrentUser } from "@/features/auth/lib/current-user";
import { rpc, withUser, type FnRow } from "@/lib/db";

/**
 * Turnos de UNA mascota, del lado del dueño.
 *
 * `get_pet_appointments` (migración 041) es `SECURITY DEFINER` y filtra
 * internamente con `has_pet_access()`: ya cubre codueños y nunca devuelve
 * `internal_notes` ni `institution_id` (ni siquiera están en su
 * `RETURNS TABLE`). Por eso esta consulta no necesita cliente de service role
 * ni volver a chequear acceso — el mismo criterio que el resto de
 * `owner/data/*`: la seguridad vive en la base, no acá.
 */

export type AppointmentStatus =
  "scheduled" | "confirmed" | "attended" | "no_show" | "cancelled";

export type PetAppointment = {
  id: string;
  fecha: string;
  hora: string;
  /** El TIMESTAMPTZ original, en UTC — para comparar u ordenar turnos sin
   * mezclar husos horarios. `fecha`/`hora` son solo para mostrar. */
  startsAtUtc: string;
  duracionMin: number;
  motivo: string;
  estado: AppointmentStatus;
  veterinaria: string;
  /** Vacío cuando el turno no tiene profesional asignado. */
  profesional: string;
};

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/**
 * `starts_at` llega como TIMESTAMPTZ en UTC (así serializa PostgREST). Cortar
 * caracteres del string (`.slice(0, 10)`/`.slice(11, 16)`) da la fecha/hora en
 * UTC, no en la zona real de la veterinaria: un turno de las 22:00 en
 * Argentina llega como las 01:00 UTC del día siguiente, y el dueño vería el
 * turno un día después y tres horas más tarde de lo que realmente es. Por
 * eso se convierte explícitamente a `America/Argentina/Buenos_Aires` —mismo
 * huso que ya usa la deduplicación de recordatorios (migración 014)— en vez
 * de asumir que el string ya viene en hora local.
 */
function fechaYHoraLocal(startsAtUtc: string): { fecha: string; hora: string } {
  const fecha = new Date(startsAtUtc);

  // Formato "en-CA" da "YYYY-MM-DD" directo, sin tener que reordenar partes.
  const fechaLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
  }).format(fecha);

  const horaLocal = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(fecha);

  return { fecha: fechaLocal, hora: horaLocal };
}

/**
 * Los próximos 3 turnos no cancelados, más cercano primero.
 *
 * `ahora` es un parámetro con default (mismo criterio que `formatAge` en
 * `lib/format.ts`) y no un `Date.now()` inline en el cuerpo de la pantalla:
 * ESLint (`react-hooks/purity`) marca error una llamada impura directa
 * dentro de un Server Component. Compara `startsAtUtc` (el TIMESTAMPTZ
 * crudo), nunca `fecha`/`hora` (ya convertidos a
 * America/Argentina/Buenos_Aires solo para mostrarse) — mezclar esos dos
 * husos horarios en la comparación reintroduciría el mismo bug que
 * `fechaYHoraLocal` corrige para la visualización.
 */
export function proximosTurnos(
  turnos: PetAppointment[],
  ahora: Date = new Date(),
): PetAppointment[] {
  const ahoraMs = ahora.getTime();
  return turnos
    .filter(
      (turno) =>
        turno.estado !== "cancelled" &&
        new Date(turno.startsAtUtc).getTime() >= ahoraMs,
    )
    .sort(
      (a, b) =>
        new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime(),
    )
    .slice(0, 3);
}

/**
 * Turnos de la mascota, sin filtrar: la pantalla decide qué recorte mostrar.
 *
 * Nunca tira una excepción: esta consulta vive adentro del `Promise.all()`
 * de la pantalla de perfil de mascota, junto a visitas/vacunas/recordatorios
 * — funciones que existen hace mucho y no tienen nada que ver con Turnos. Si
 * `getPetAppointments` tirara, un solo `reject` del `Promise.all` tumbaría
 * TODA la pantalla para cualquier dueño, incluida gente que ni sabe que
 * Turnos existe (por ejemplo, si la migración 041 todavía no llegó a la base
 * contra la que corre esto — el RPC no existiría y esto fallaría siempre).
 * Se degrada a "sin turnos" y se deja registrado, en vez de romper una
 * pantalla que no tiene por qué depender de esto — mismo criterio que
 * `getVetSession()` con el estado Premium.
 */
export async function getPetAppointments(
  petId: string,
): Promise<PetAppointment[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  let data: FnRow<"get_pet_appointments">[];
  try {
    data = await withUser(user.id, (tx) =>
      rpc<FnRow<"get_pet_appointments">>(tx, "get_pet_appointments", {
        p_pet_id: petId,
      }),
    );
  } catch (error) {
    console.error("No se pudieron leer los turnos de la mascota", error);
    return [];
  }

  return data.map((row) => {
    const { fecha, hora } = fechaYHoraLocal(row.starts_at);
    return {
      id: row.id,
      fecha,
      hora,
      startsAtUtc: row.starts_at,
      duracionMin: row.duration_min,
      motivo: row.reason,
      estado: row.status as AppointmentStatus,
      veterinaria: row.institution_name,
      profesional: row.professional_name ?? "",
    };
  });
}

/** Un turno próximo con su mascota, para las pantallas que cruzan todas. */
export type OwnerAppointment = PetAppointment & {
  petId: string;
  petNombre: string;
  petFotoUrl: string | null;
};

/**
 * Los próximos turnos del dueño, de TODAS sus mascotas, en una sola consulta.
 *
 * `getPetAppointments()` responde por mascota, así que usarla para el inicio
 * sería una llamada por mascota en el camino crítico del render. La RPC de la
 * 062 hace el cruce en Postgres y ya viene filtrada y ordenada: "próximo"
 * —futuro, y en estado `scheduled` o `confirmed`— se define una sola vez, en
 * la base, para que el widget del inicio y la pantalla de recordatorios no
 * puedan discrepar sobre qué cuenta como turno próximo.
 *
 * Igual que su hermana, **nunca lanza**: entra en el `Promise.all` del
 * dashboard junto a consultas que existen hace mucho, y un `reject` acá
 * tumbaría el inicio entero de cualquier dueño. Se degrada a "sin turnos".
 */
export async function getOwnerUpcomingAppointments(
  limite = 5,
): Promise<OwnerAppointment[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  let data: FnRow<"get_owner_upcoming_appointments">[];
  try {
    data = await withUser(user.id, (tx) =>
      rpc<FnRow<"get_owner_upcoming_appointments">>(
        tx,
        "get_owner_upcoming_appointments",
        { p_limit: limite },
      ),
    );
  } catch (error) {
    console.error("No se pudieron leer los próximos turnos", error);
    return [];
  }

  return data.map((row) => {
    const { fecha, hora } = fechaYHoraLocal(row.starts_at);
    return {
      id: row.id,
      fecha,
      hora,
      startsAtUtc: row.starts_at,
      duracionMin: row.duration_min,
      motivo: row.reason,
      estado: row.status as AppointmentStatus,
      veterinaria: row.institution_name,
      profesional: row.professional_name ?? "",
      petId: row.pet_id,
      petNombre: row.pet_name,
      petFotoUrl: row.pet_photo_url,
    };
  });
}

/**
 * Cómo se nombra y se pinta cada estado de turno.
 *
 * Vivía dentro de la página de perfil de mascota con el argumento de que
 * tenía un solo consumidor. Con el widget del inicio y la pantalla de
 * recordatorios pasan a ser tres, y ese argumento se cae: tres copias de un
 * mapa de etiquetas es la forma más segura de que dentro de un mes la misma
 * palabra signifique dos cosas distintas en dos pantallas.
 */
export const ESTADO_TURNO: Record<
  AppointmentStatus,
  { label: string; variant: "brand" | "success" | "warning" | "neutral" }
> = {
  scheduled: { label: "Programado", variant: "brand" },
  confirmed: { label: "Confirmado", variant: "brand" },
  attended: { label: "Atendido", variant: "success" },
  no_show: { label: "No asistió", variant: "warning" },
  cancelled: { label: "Cancelado", variant: "neutral" },
};
