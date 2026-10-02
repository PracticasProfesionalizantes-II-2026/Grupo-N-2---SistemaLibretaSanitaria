import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPatientFile } from "@/features/vet/actions/patient-actions";
import { NewConsultationForm } from "@/features/vet/components/consultation/new-consultation-form";
import { listWaitingRoom } from "@/features/vet/actions/waiting-room-actions";
import { horaArgentina, hoyArgentina } from "@/lib/argentina-time";

export const metadata: Metadata = { title: "Nueva consulta" };

export default async function NewConsultationPage({
  params,
  searchParams,
}: PageProps<"/veterinaria/pacientes/[patientId]/consulta">) {
  const { patientId } = await params;
  const { visita } = await searchParams;

  const ficha = await getPatientFile(patientId);
  if (!ficha) notFound();

  // Entrar desde la sala de espera precarga la hora y el motivo de la visita.
  const visit =
    typeof visita === "string"
      ? (await listWaitingRoom()).find((item) => item.id === visita)
      : undefined;

  const hoy = new Date();

  return (
    <NewConsultationForm
      patient={ficha.paciente}
      visitId={visit?.id}
      defaultDate={visit?.fecha ?? hoyArgentina(hoy)}
      defaultTime={
        visit?.horaAtencion ?? visit?.horaLlegada ?? horaArgentina(hoy)
      }
      visitReason={visit?.motivo}
    />
  );
}
