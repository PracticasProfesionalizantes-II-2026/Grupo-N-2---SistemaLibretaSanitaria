import { notFound } from "next/navigation";

import { PatientDocuments } from "@/features/vet/components/patient/patient-documents";
import { getPatientFile } from "@/features/vet/actions/patient-actions";
import { toPetDocument } from "@/features/owner/lib/mappers";

export default async function PatientStudiesPage({
  params,
}: PageProps<"/veterinaria/pacientes/[patientId]/estudios">) {
  const { patientId } = await params;
  const ficha = await getPatientFile(patientId);

  if (!ficha) notFound();

  return (
    <PatientDocuments
      documents={ficha.estudios.map(toPetDocument)}
      patientName={ficha.paciente.nombre}
    />
  );
}
