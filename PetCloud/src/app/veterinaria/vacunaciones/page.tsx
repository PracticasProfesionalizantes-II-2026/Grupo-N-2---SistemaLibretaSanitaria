import type { Metadata } from "next";
import { Suspense } from "react";

import { VaccinationsView } from "@/features/vet/components/vaccination/vaccinations-view";
import { listVaccinationRows } from "@/features/vet/actions/vaccination-actions";
import { getVaccinePresets } from "@/features/vet/actions/vaccine-preset-actions";
import { listTeam } from "@/features/vet/actions/institution-actions";

export const metadata: Metadata = { title: "Vacunaciones" };

export default async function VaccinationsPage() {
  const [aplicaciones, presets, equipo] = await Promise.all([
    listVaccinationRows(),
    getVaccinePresets(),
    listTeam(),
  ]);

  // `useSearchParams` necesita un límite de Suspense para no bloquear el prerender.
  return (
    <Suspense>
      <VaccinationsView
        aplicaciones={aplicaciones}
        vacunas={presets.map((preset) => preset.vacuna)}
        presets={presets}
        equipo={equipo}
      />
    </Suspense>
  );
}
