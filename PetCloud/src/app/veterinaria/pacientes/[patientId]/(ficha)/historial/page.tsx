import { notFound } from "next/navigation";

import { ClinicalTimeline } from "@/features/vet/components/patient/clinical-timeline";
import { getPatientFile } from "@/features/vet/actions/patient-actions";
import { toConsultation } from "@/features/vet/lib/mappers";

export default async function PatientHistoryPage({
  params,
}: PageProps<"/veterinaria/pacientes/[patientId]/historial">) {
  const { patientId } = await params;
  const ficha = await getPatientFile(patientId);

  if (!ficha) notFound();

  // Los borradores quedan afuera: la historia clínica es lo que alguien firmó.
  // Lo que está a medio escribir todavía no es un antecedente del paciente, y
  // mezclarlo acá haría que la línea de tiempo contara cosas sin respaldo.
  const consultas = ficha.historial
    .map(toConsultation)
    .filter((consulta) => !consulta.borrador);

  return <ClinicalTimeline consultations={consultas} petId={patientId} />;
}
