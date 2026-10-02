import { notFound } from "next/navigation";

import { PatientTreatments } from "@/features/vet/components/patient/patient-treatments";
import { getPatientFile } from "@/features/vet/actions/patient-actions";
import { toMedication } from "@/features/owner/lib/mappers";

export default async function PatientTreatmentsPage({
  params,
}: PageProps<"/veterinaria/pacientes/[patientId]/tratamientos">) {
  const { patientId } = await params;
  const ficha = await getPatientFile(patientId);

  if (!ficha) notFound();

  return (
    <PatientTreatments
      medications={ficha.medicacion.map(toMedication)}
      patientName={ficha.paciente.nombre}
    />
  );
}
