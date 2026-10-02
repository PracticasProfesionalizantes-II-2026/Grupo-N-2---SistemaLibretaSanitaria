import "server-only";

import { sql } from "drizzle-orm";

import {
  DAY_LABELS_PLURAL,
  DAYS_OF_WEEK,
  type DayOfWeek,
  dayOfWeekSchema,
  todayInBuenosAires,
} from "@/features/vet/schemas/schedule-schemas";
import { getDb, query } from "@/lib/db";

/**
 * Directorio de veterinarias validadas por PetCloud, con su guardia.
 */

export type VetDirectoryEntry = {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  web: string;
  logoUrl: string;
  /** Del alta de la veterinaria (055); el RPC solo devuelve clínicas con ambas. */
  latitud: number;
  longitud: number;
  /**
   * Deriva de `on_call`, nunca de `onCallNames.length`. `on_call_names` sale
   * de un join contra `profiles`, que no es `USING (true)` como
   * `vet_professionals` — bajo RLS puede volver vacío para una clínica que
   * sí tiene guardia. Si el badge dependiera del largo del array, la misma
   * clínica se vería con o sin guardia según quién mire.
   */
  deGuardia: boolean;
  /** Nombres de quienes están de guardia; puede venir vacío aun con
   * `deGuardia = true` (ver comentario de arriba). La UI no debe leer esto
   * como "sin guardia". */
  profesionalesDeGuardia: string[];
  /** Días de guardia programada de la clínica (070), en orden de semana. */
  diasDeGuardia: DayOfWeek[];
  /**
   * Hoy —en Buenos Aires— es uno de esos días. Con esto la clínica figura de
   * guardia aunque nadie tenga el interruptor prendido.
   */
  guardiaProgramadaHoy: boolean;
  /** "Hace guardia los sábados", o `null` si no programó ningún día. */
  resumenGuardiaProgramada: string | null;
};

/** "los sábados", "los sábados y domingos", "los lunes, martes y viernes". */
function describirDiasDeGuardia(dias: DayOfWeek[]): string | null {
  if (dias.length === 0) return null;
  if (dias.length === DAYS_OF_WEEK.length) return "Hace guardia todos los días";

  const nombres = dias.map((dia) => DAY_LABELS_PLURAL[dia]);
  const lista =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;

  return `Hace guardia los ${lista}`;
}

/**
 * Lo que venga de la base que no sea un día válido se descarta (el CHECK de
 * la 070 no debería dejar pasar nada), y se ordena de lunes a domingo.
 */
function normalizarDias(dias: string[] | null | undefined): DayOfWeek[] {
  const validos = new Set(
    (dias ?? []).filter((dia) => dayOfWeekSchema.safeParse(dia).success),
  );
  return DAYS_OF_WEEK.filter((dia) => validos.has(dia));
}

function mapear(
  filas: {
    id: string;
    name: string;
    address: string;
    phone: string;
    website: string;
    logo_url: string;
    latitude: number;
    longitude: number;
    on_call: boolean;
    on_call_names: string[];
    on_call_schedule: string[];
  }[],
  hoy: DayOfWeek,
): VetDirectoryEntry[] {
  return filas.map((fila) => {
    const dias = normalizarDias(fila.on_call_schedule);
    return {
      id: fila.id,
      nombre: fila.name,
      direccion: fila.address ?? "",
      telefono: fila.phone ?? "",
      web: fila.website ?? "",
      logoUrl: fila.logo_url ?? "",
      latitud: Number(fila.latitude),
      longitud: Number(fila.longitude),
      deGuardia: fila.on_call,
      profesionalesDeGuardia: fila.on_call_names ?? [],
      diasDeGuardia: dias,
      guardiaProgramadaHoy: dias.includes(hoy),
      resumenGuardiaProgramada: describirDiasDeGuardia(dias),
    };
  });
}

/** Todas las clínicas validadas, por nombre. */
export async function listVetDirectory(): Promise<VetDirectoryEntry[]> {
  const filas = await query<Parameters<typeof mapear>[0][number]>(
    getDb(),
    sql`select i.id, i.name, i.address, i.phone, i.website, i.logo_url,
               i.latitude, i.longitude,
               coalesce(i.on_call_schedule, '[]'::jsonb) as on_call_schedule,
               exists(select 1 from vet_professionals vp
                       where vp.institution_id = i.id and vp.on_call
                         and vp.removed_at is null) as on_call,
               coalesce((select array_agg(trim(p.first_name || ' ' || p.last_name))
                  from vet_professionals vp join profiles p on p.id = vp.profile_id
                 where vp.institution_id = i.id and vp.on_call
                   and vp.removed_at is null), '{}') as on_call_names
          from vet_institutions i
         where i.validated
         order by i.name`,
  );

  // "Hoy" es el de Buenos Aires, no el del servidor.
  return mapear(filas, todayInBuenosAires());
}
