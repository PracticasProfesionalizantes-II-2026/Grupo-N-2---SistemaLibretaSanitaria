import { notFound } from "next/navigation";

import { PatientSummary } from "@/features/vet/components/patient/patient-summary";
import { getPatientFile } from "@/features/vet/actions/patient-actions";
import { toConsultation } from "@/features/vet/lib/mappers";
import { toMedication, toVaccination } from "@/features/owner/lib/mappers";

export default async function PatientOverviewPage({
  params,
}: PageProps<"/veterinaria/pacientes/[patientId]">) {
  const { patientId } = await params;
  const ficha = await getPatientFile(patientId);

  if (!ficha) notFound();

  // La consulta que se muestra arriba de todo es la última **firmada**: un
  // borrador a medio escribir no es lo que resume el estado del paciente.
  const consultas = ficha.historial.map(toConsultation);
  const ultimaConsulta = consultas.find((consulta) => !consulta.borrador);

  const vacunas = ficha.vacunas.map((row) => toVaccination(row));
  const proximaVacuna = vacunas
    .filter((vacuna) => vacuna.proximaDosis)
    .sort((a, b) => (a.proximaDosis ?? "").localeCompare(b.proximaDosis ?? ""))
    .at(0);

  const medicacionActiva = ficha.medicacion
    .map(toMedication)
    .filter((medicacion) => !medicacion.hasta);

  // La visita abierta manda: si está en la sala ahora, es lo primero que importa.
  const ultimaVisita =
    ficha.visitas.find(
      (visita) =>
        visita.estado === "en-espera" || visita.estado === "en-atencion",
    ) ?? ficha.visitas.at(0);

  return (
    <PatientSummary
      patientId={ficha.paciente.id}
      ultimaConsulta={ultimaConsulta}
      proximaVacuna={proximaVacuna}
      medicacionActiva={medicacionActiva}
      ultimaVisita={ultimaVisita}
    />
  );
}
