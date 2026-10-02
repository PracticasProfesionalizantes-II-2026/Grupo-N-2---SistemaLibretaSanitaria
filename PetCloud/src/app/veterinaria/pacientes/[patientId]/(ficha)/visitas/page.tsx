import { notFound } from "next/navigation";

import { PatientVisits } from "@/features/vet/components/patient/patient-visits";
import { getPatientFile } from "@/features/vet/actions/patient-actions";

export default async function PatientVisitsPage({
  params,
}: PageProps<"/veterinaria/pacientes/[patientId]/visitas">) {
  const { patientId } = await params;
  const ficha = await getPatientFile(patientId);

  if (!ficha) notFound();

  return (
    <PatientVisits visits={ficha.visitas} patientName={ficha.paciente.nombre} />
  );
}
