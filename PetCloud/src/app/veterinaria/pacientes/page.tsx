import type { Metadata } from "next";
import { Suspense } from "react";

import { PatientsView } from "@/features/vet/components/patients/patients-view";
import { listPatientRows } from "@/features/vet/actions/patient-actions";
import { listTeam } from "@/features/vet/actions/institution-actions";

export const metadata: Metadata = { title: "Pacientes" };

export default async function PatientsPage() {
  const [pacientes, equipo] = await Promise.all([
    listPatientRows(),
    listTeam(),
  ]);

  // `useSearchParams` necesita un límite de Suspense para no bloquear el prerender.
  return (
    <Suspense>
      <PatientsView pacientes={pacientes} equipo={equipo} />
    </Suspense>
  );
}
