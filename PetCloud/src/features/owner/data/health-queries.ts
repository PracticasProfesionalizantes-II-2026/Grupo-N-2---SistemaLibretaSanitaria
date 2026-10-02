import "server-only";

import { sql } from "drizzle-orm";

import { getCurrentUser } from "@/features/auth/lib/current-user";
import { myPetScope } from "@/features/owner/data/owner-scope";
import { getDb, query } from "@/lib/db";
import { hoyArgentina } from "@/lib/argentina-time";

/**
 * Plan de vacunación del dueño.
 *
 * Devuelve qué dosis le faltan a cada mascota y cuándo. Con qué operativo
 * municipal se cruza cada dosis **no se resuelve acá**: depende de la
 * jurisdicción del vecino, que vive en el contexto del panel. Esta capa se
 * queda con lo que es del historial y nada más.
 *
 * Acotado a las mascotas del usuario (propias y compartidas).
 */

export type DoseUrgency = "vencida" | "proxima" | "programada";

export type UpcomingDose = {
  id: string;
  petId: string;
  petNombre: string;
  vacuna: string;
  fecha: string;
  urgencia: DoseUrgency;
  /** Dónde se aplicó la dosis anterior. */
  ultimoLugar: string;
};

const DIAS_AVISO = 45;

function daysFromToday(to: string) {
  const hoy = hoyArgentina();
  const start = new Date(`${hoy}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();

  return Math.round((end - start) / 86_400_000);
}

function urgencyFor(fecha: string): DoseUrgency {
  const days = daysFromToday(fecha);
  if (days < 0) return "vencida";
  if (days <= DIAS_AVISO) return "proxima";

  return "programada";
}

/**
 * Vacunas y antiparasitarios con fecha futura.
 *
 * Los antiparasitarios entran acá desde la fase 5. Antes solo se miraban las
 * vacunas, y eso dejaba al tablero contando menos cosas de las que el
 * despachador de recordatorios avisaba: dos respuestas para la misma pregunta.
 *
 * La ventana de esta función (`DIAS_AVISO`) es la de **mostrar** en pantalla. La
 * de **empujar** por correo es más angosta y vive en la Edge Function
 * `dispatch-reminders`; están anotadas la una en la otra.
 */
export async function getUpcomingDoses(
  petId?: string,
): Promise<UpcomingDose[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const db = getDb();
  const filtro = petId
    ? sql`x.pet_id = ${petId} and ${myPetScope(user.id, "p")}`
    : sql`${myPetScope(user.id, "p")}`;

  const [dosis, pipetas] = await Promise.all([
    query<{
      id: string;
      pet_id: string;
      vaccine_name: string;
      next_dose_at: string;
      location: string | null;
      pet_name: string;
    }>(
      db,
      sql`select x.id, x.pet_id, x.vaccine_name, x.next_dose_at::text,
                 x.location, p.name as pet_name
            from vaccinations x join pets p on p.id = x.pet_id
           where x.next_dose_at is not null and ${filtro}`,
    ),
    query<{
      id: string;
      pet_id: string;
      product_name: string;
      next_application_at: string;
      pet_name: string;
    }>(
      db,
      sql`select x.id, x.pet_id, x.product_name, x.next_application_at::text,
                 p.name as pet_name
            from dewormings x join pets p on p.id = x.pet_id
           where x.next_application_at is not null and ${filtro}`,
    ),
  ]);

  const todas: UpcomingDose[] = [
    ...dosis.map((item) => ({
      id: `dose-${item.id}`,
      petId: item.pet_id,
      petNombre: item.pet_name ?? "Mascota",
      vacuna: item.vaccine_name,
      fecha: item.next_dose_at,
      urgencia: urgencyFor(item.next_dose_at),
      ultimoLugar: item.location ?? "",
    })),
    ...pipetas.map((item) => ({
      id: `deworm-${item.id}`,
      petId: item.pet_id,
      petNombre: item.pet_name ?? "Mascota",
      vacuna: item.product_name,
      fecha: item.next_application_at,
      urgencia: urgencyFor(item.next_application_at),
      ultimoLugar: "",
    })),
  ];

  return todas.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Las que hay que resolver ya: vencidas o dentro de la ventana de aviso. */
export async function getPendingDoses(petId?: string) {
  const doses = await getUpcomingDoses(petId);

  return doses.filter((dose) => dose.urgencia !== "programada");
}
