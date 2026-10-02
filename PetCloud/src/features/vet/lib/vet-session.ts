import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { INCOMPLETE_ACCOUNT_ROUTE } from "@/config/app-routes";
import { sql } from "drizzle-orm";

import { getDb, query } from "@/lib/db";
import { getCurrentUser } from "@/features/auth/lib/current-user";
import { getPremiumState } from "@/features/vet/lib/vet-premium";
import {
  absenceStatusSchema,
  type DayOfWeek,
  type Schedule,
  onCallScheduleSchema,
  scheduleSchema,
} from "@/features/vet/schemas/schedule-schemas";

function parseSchedule(valor: unknown): Schedule {
  const parsed = scheduleSchema.safeParse(valor ?? {});
  return parsed.success ? (parsed.data as Schedule) : {};
}

function parseOnCallSchedule(valor: unknown): DayOfWeek[] {
  const parsed = onCallScheduleSchema.safeParse(valor ?? []);
  return parsed.success ? parsed.data : [];
}

/**
 * El profesional que está usando el panel, con su institución.
 *
 * Envuelto en `cache()` de React: en una misma pantalla lo preguntan el layout,
 * el encabezado y cada consulta, y sin esto serían varios viajes por página.
 *
 * `licenciaValidada` es el dato que decide qué puede hacer: con la matrícula en
 * revisión se carga la atención pero no se la firma. La comprobación de verdad
 * vive en la base (trigger `medical_records_enforce_signature`); esto es lo que
 * permite explicarlo en pantalla antes de que la persona escriba la consulta
 * entera y recién ahí se entere.
 *
 * `premium` sale de `getPremiumState()` (fase 5): también está envuelta en
 * `cache()`, así que agregarla acá no suma un viaje nuevo para quien ya la
 * pide por su cuenta (la pantalla de facturación, fase 6) en el mismo render.
 */
export const getVetSession = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  type Fila = {
    id: string;
    license_number: string;
    license_validated: boolean;
    specialty: string | null;
    role_in_institution: string;
    institution_id: string;
    on_call: boolean;
    absence_status: string;
    firma_id: string | null;
    firma_path: string | null;
    inst: {
      name: string;
      address: string | null;
      phone: string | null;
      website: string | null;
      logo_url: string | null;
      validated: boolean;
      latitude: number | null;
      longitude: number | null;
      schedule: unknown;
      on_call_schedule: unknown;
    } | null;
  };

  let data: Fila | undefined;
  try {
    // Sin dados de baja (058) y con la firma vigente de `vet_signatures` (064).
    [data] = await query<Fila>(
      getDb(),
      sql`select vp.id, vp.license_number, vp.license_validated, vp.specialty,
                 vp.role_in_institution, vp.institution_id, vp.on_call,
                 vp.absence_status, vs.id as firma_id, vs.image_path as firma_path,
                 (select json_build_object('name', i.name, 'address', i.address,
                    'phone', i.phone, 'website', i.website, 'logo_url', i.logo_url,
                    'validated', i.validated, 'latitude', i.latitude,
                    'longitude', i.longitude, 'schedule', i.schedule,
                    'on_call_schedule', i.on_call_schedule)
                    from vet_institutions i where i.id = vp.institution_id) as inst
            from vet_professionals vp
            left join vet_signatures vs
              on vs.vet_professional_id = vp.id and vs.superseded_at is null
           where vp.profile_id = ${user.id} and vp.removed_at is null
           limit 1`,
    );
  } catch (error) {
    console.error("getVetSession: no se pudo leer la ficha", error);
    return null;
  }
  if (!data) return null;

  // Si falla la consulta del estado Premium, no tiene que tirar abajo TODA la
  // sesión del veterinario — quedaría bloqueado hasta de "Escanear QR" o
  // "Pacientes" por un problema ajeno a esas pantallas. Se degrada a "sin
  // acceso premium" (fail-closed: nunca se otorga por error) y se deja
  // registrado, en vez de propagar la excepción.
  const premium = await getPremiumState(data.institution_id).catch((error) => {
    console.error("No se pudo obtener el estado Premium", error);
    return { activo: false, estado: "vencido", hasta: null } as const;
  });

  return {
    usuario: user,
    profesionalId: data.id,
    matricula: data.license_number,
    licenciaValidada: data.license_validated,
    especialidad: data.specialty ?? "",
    rolEnInstitucion: data.role_in_institution,
    // La ruta del objeto de la firma vigente, o `null` si no cargó ninguna.
    // Sigue llamándose `firmaUrl` porque es lo que consume la emisión de
    // certificados; lo que cambió es de dónde sale.
    firmaUrl: data.firma_path,
    firmaId: data.firma_id,
    institucionId: data.institution_id,
    // Guardia propia (055): se lee acá junto al resto de la sesión para que
    // la pantalla de Institución arranque con el valor real de la base, no
    // con un estado optimista.
    deGuardia: data.on_call,
    // 071: "Disponible", "No estoy" o "De vacaciones". El CHECK garantiza el
    // valor; si algo raro llegara, se muestra como disponible.
    ausencia: absenceStatusSchema.catch("available").parse(data.absence_status),
    institucion: {
      nombre: data.inst?.name ?? "",
      direccion: data.inst?.address ?? "",
      telefono: data.inst?.phone ?? "",
      web: data.inst?.website ?? "",
      logoUrl: data.inst?.logo_url ?? null,
      validada: data.inst?.validated ?? false,
      latitud: data.inst?.latitude ?? undefined,
      longitud: data.inst?.longitude ?? undefined,
      // 068: el CHECK garantiza la forma; lo que no pase el schema (no
      // debería haber nada) se trata como "sin horarios cargados".
      horarios: parseSchedule(data.inst?.schedule),
      // 070: los días en que la clínica hace guardia.
      diasDeGuardia: parseOnCallSchedule(data.inst?.on_call_schedule),
    },
    premium,
  };
});

export type VetSession = NonNullable<Awaited<ReturnType<typeof getVetSession>>>;

/**
 * Para las pantallas y acciones del panel.
 *
 * Alguien autenticado que no tiene ficha de profesional no es un error de
 * permisos sino de rol: el proxy ya lo habría mandado a su propio panel, así que
 * llegar acá sin ficha significa una cuenta a medio crear.
 */
export async function requireVet(): Promise<VetSession> {
  const session = await getVetSession();
  // Con sesión pero sin ficha, `/login` rebota al panel y el panel vuelve acá:
  // bucle. Ver `requireMunicipality()`.
  if (!session) {
    redirect((await getCurrentUser()) ? INCOMPLETE_ACCOUNT_ROUTE : "/login");
  }

  return session;
}
