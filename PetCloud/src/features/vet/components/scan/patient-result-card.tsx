import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HealthStatusChip } from "@/components/ui/status-chip";
import { VET_BASE } from "@/config/vet-nav";
import type { PatientOwner } from "@/types/vet";
import { capitalize, formatAge } from "@/lib/format";
import type { Patient } from "@/types/vet";

export function PatientResultCard({
  patient,
  owner,
  goToConsultation = false,
}: {
  patient: Patient;
  /** Llega junto con la mascota en la misma consulta; la tarjeta no lo busca. */
  owner?: PatientOwner | null;
  goToConsultation?: boolean;
}) {
  const base = `${VET_BASE}/pacientes/${patient.id}`;

  return (
    // Siempre apilada: la tarjeta vive en la columna angosta del escáner, donde
    // una fila horizontal parte el texto en tres líneas.
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <Avatar name={patient.nombre} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-foreground font-semibold">{patient.nombre}</p>
            <HealthStatusChip status={patient.estadoSanitario} />
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {/* La edad puede venir vacía si no hay fecha de nacimiento: se
                filtra para no dejar un separador suelto. */}
            {[
              capitalize(patient.especie),
              patient.raza,
              formatAge(patient.fechaNacimiento),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-muted-foreground text-sm">
            {owner?.nombre ?? "Dueño registrado"}
          </p>
          <p className="text-muted-foreground text-sm">
            {owner?.telefono ?? ""}
          </p>
          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
            {patient.qrCode}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink href={base} variant="outline" size="sm">
          Ver ficha
        </ButtonLink>
        <ButtonLink
          href={`${base}/consulta`}
          size="sm"
          variant={goToConsultation ? "primary" : "secondary"}
        >
          Nueva consulta
        </ButtonLink>
      </div>
    </Card>
  );
}
