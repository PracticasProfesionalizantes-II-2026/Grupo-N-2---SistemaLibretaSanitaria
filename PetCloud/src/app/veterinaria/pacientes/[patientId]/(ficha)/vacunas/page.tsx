import { notFound } from "next/navigation";

import { PatientVaccinations } from "@/features/vet/components/patient/patient-vaccinations";
import { getPatientFile } from "@/features/vet/actions/patient-actions";
import { toVaccination } from "@/features/owner/lib/mappers";

export default async function PatientVaccinesPage({
  params,
}: PageProps<"/veterinaria/pacientes/[patientId]/vacunas">) {
  const { patientId } = await params;
  const ficha = await getPatientFile(patientId);

  if (!ficha) notFound();

  // Las mismas filas que ve el dueño, con el mismo mapper: si acá se contaran
  // distinto, dos pantallas dirían cosas diferentes de la misma vacuna.
  const vacunas = ficha.vacunas.map((row) => toVaccination(row));

  return <PatientVaccinations vaccinations={vacunas} petId={patientId} />;
}
