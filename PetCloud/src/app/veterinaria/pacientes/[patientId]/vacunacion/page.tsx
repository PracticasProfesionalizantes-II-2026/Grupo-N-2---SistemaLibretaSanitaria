import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RecordVaccinationForm } from "@/features/vet/components/vaccination/record-vaccination-form";
import { getPatientFile } from "@/features/vet/actions/patient-actions";
import { getVaccinePresets } from "@/features/vet/actions/vaccine-preset-actions";

export const metadata: Metadata = { title: "Cargar vacunación" };

export default async function RecordVaccinationPage({
  params,
}: PageProps<"/veterinaria/pacientes/[patientId]/vacunacion">) {
  const { patientId } = await params;

  const [ficha, presets] = await Promise.all([
    getPatientFile(patientId),
    getVaccinePresets(),
  ]);

  if (!ficha) notFound();

  return <RecordVaccinationForm paciente={ficha.paciente} presets={presets} />;
}
