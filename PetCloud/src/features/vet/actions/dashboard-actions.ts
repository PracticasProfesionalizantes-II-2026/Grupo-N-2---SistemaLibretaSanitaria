"use server";

import "server-only";

import { sql } from "drizzle-orm";

import { requireVet } from "@/features/vet/lib/vet-session";
import { getDb, query } from "@/lib/db";
import { VET_BASE } from "@/config/vet-nav";
import type { VetNotice } from "@/types/vet";
import { hoyArgentina, limitesDiaArgentina } from "@/lib/argentina-time";

/**
 * Lo que la institución mira al abrir el panel.
 *
 * Son números del día y del mes, no acumulados históricos: el tablero existe
 * para decidir qué hacer ahora —cuánta gente está esperando, cuánto se demora—
 * y un total de todos los tiempos no ayuda a eso.
 */

const hoy = () => hoyArgentina();

export type DashboardMetrics = {
  enEspera: number;
  /** `null` si hoy todavía no se atendió a nadie: no hay espera que promediar. */
  esperaPromedio: number | null;
  atendidosHoy: number;
  vacunasAplicadas: number;
};

/** Los profesionales de la institución, que es por donde se filtra todo. */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const vet = await requireVet();

  const dia = hoy();
  const desdeElMes = `${dia.slice(0, 7)}-01`;

  const db = getDb();
  const { inicio, fin } = limitesDiaArgentina(dia);

  const [filas, [vacunas]] = await Promise.all([
    query<{ status: string; checked_in_at: string; updated_at: string }>(
      db,
      sql`select status, checked_in_at::text, updated_at::text from visits
           where institution_id = ${vet.institucionId}
             and checked_in_at >= ${inicio} and checked_in_at < ${fin}`,
    ),
    query<{ total: number }>(
      db,
      sql`select count(*)::int as total from vaccinations
           where applied_at >= ${desdeElMes}
             and applied_by_id in (select id from vet_professionals
                                    where institution_id = ${vet.institucionId})`,
    ),
  ]);

  const atendidas = filas.filter((v) => v.status !== "waiting");

  const minutos = atendidas.map((v) =>
    Math.max(
      0,
      Math.round(
        (new Date(v.updated_at).getTime() -
          new Date(v.checked_in_at).getTime()) /
          60000,
      ),
    ),
  );

  const vacunasAplicadas = vacunas?.total ?? 0;

  return {
    enEspera: filas.filter((v) => v.status === "waiting").length,
    esperaPromedio: minutos.length
      ? Math.round(minutos.reduce((a, b) => a + b, 0) / minutos.length)
      : null,
    atendidosHoy: filas.filter((v) => v.status === "completed").length,
    vacunasAplicadas,
  };
}

/**
 * Avisos del panel.
 *
 * Por ahora, solo vencimientos de vacunas: son los únicos que salen de datos
 * que existen. Inventar otros avisos acá sería mostrar avisos que no responden a
 * nada, y un aviso en el que no se puede confiar deja de leerse.
 */
const EN_30_DIAS = 30 * 864e5;

export async function getVetNotices(): Promise<VetNotice[]> {
  const vet = await requireVet();

  // Las mascotas de la casa: las que pasaron por acá. El vencimiento de un
  // animal que nunca vino no es un pendiente de esta veterinaria.
  const limite = hoyArgentina(new Date(Date.now() + EN_30_DIAS));

  const data = await query<{
    id: string;
    pet_id: string;
    vaccine_name: string;
    next_dose_at: string | null;
    pet_name: string | null;
  }>(
    getDb(),
    sql`select v.id, v.pet_id, v.vaccine_name, v.next_dose_at::text, p.name as pet_name
          from vaccinations v join pets p on p.id = v.pet_id
         where v.pet_id in (
                 select pet_id from visits where institution_id = ${vet.institucionId}
                 union
                 select pet_id from medical_records where institution_id = ${vet.institucionId})
           and v.next_dose_at is not null and v.next_dose_at <= ${limite}
         order by v.next_dose_at limit 8`,
  );

  const dia = hoy();

  return data.map((row) => {
    const vencida = (row.next_dose_at ?? "") < dia;
    const nombre = row.pet_name ?? "Un paciente";

    return {
      id: row.id,
      tipo: "vencimiento" as const,
      titulo: vencida
        ? `${nombre} tiene la ${row.vaccine_name.toLowerCase()} vencida`
        : `A ${nombre} le vence la ${row.vaccine_name.toLowerCase()}`,
      detalle: vencida
        ? `Venció el ${row.next_dose_at}. Si vuelve por el consultorio, conviene revisarlo.`
        : `Vence el ${row.next_dose_at}.`,
      href: `${VET_BASE}/pacientes/${row.pet_id}/vacunas`,
    };
  });
}
