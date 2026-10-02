import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { VET_BASE } from "@/config/vet-nav";
import { PatientHeader } from "@/features/vet/components/patient/patient-header";
import { getPatientFile } from "@/features/vet/actions/patient-actions";
import { toCondition } from "@/features/owner/lib/mappers";

export default async function PatientRecordLayout({
  children,
  params,
}: LayoutProps<"/veterinaria/pacientes/[patientId]">) {
  const { patientId } = await params;
  const ficha = await getPatientFile(patientId);

  if (!ficha) notFound();

  const patient = ficha.paciente;

  const base = `${VET_BASE}/pacientes/${patient.id}`;
  const tabs = [
    { label: "Resumen", href: base },
    { label: "Historial clínico", href: `${base}/historial` },
    { label: "Vacunas", href: `${base}/vacunas` },
    { label: "Tratamientos", href: `${base}/tratamientos` },
    { label: "Estudios", href: `${base}/estudios` },
    { label: "Visitas", href: `${base}/visitas` },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Pacientes", href: `${VET_BASE}/pacientes` },
          { label: patient.nombre },
        ]}
      />

      <PatientHeader
        patient={patient}
        owner={ficha.dueno ?? undefined}
        alerts={ficha.condiciones.map(toCondition)}
      />

      <div className="mt-8">
        <Tabs items={tabs} />
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}
