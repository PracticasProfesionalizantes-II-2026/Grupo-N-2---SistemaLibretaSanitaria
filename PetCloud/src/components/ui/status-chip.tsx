import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/features/vet/data/appointments";
import type { HealthStatus } from "@/types/pet";
import type { ReminderStatus } from "@/types/schedule";
import type { VisitPriority, VisitStatus } from "@/types/visit";
import type { ProfessionalStatus } from "@/types/vet";

export const HEALTH_LABELS: Record<
  HealthStatus,
  { label: string; variant: "success" | "warning" | "danger" | "neutral" }
> = {
  "al-dia": { label: "Al día", variant: "success" },
  "por-vencer": { label: "Próxima a vencer", variant: "warning" },
  vencida: { label: "Vencida", variant: "danger" },
  // Gris, no rojo: "no sabemos" no es "está mal". Un rojo acá acusaría de algo
  // a quien quizás tiene a su mascota vacunada y todavía no lo cargó.
  "sin-datos": { label: "Sin datos", variant: "neutral" },
};

export function HealthStatusChip({ status }: { status: HealthStatus }) {
  const { label, variant } = HEALTH_LABELS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const REMINDER_LABELS: Record<
  ReminderStatus,
  { label: string; variant: "brand" | "success" | "danger" }
> = {
  activo: { label: "Activo", variant: "brand" },
  cumplido: { label: "Cumplido", variant: "success" },
  vencido: { label: "Vencido", variant: "danger" },
};

export function ReminderStatusChip({ status }: { status: ReminderStatus }) {
  const { label, variant } = REMINDER_LABELS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

/** Marca los registros que cargó el dueño y todavía no validó un veterinario. */
export function UnverifiedChip() {
  return <Badge variant="warning">No verificado</Badge>;
}

/** Dosis autodeclarada en una campaña, todavía en la cola de revisión del veterinario. */
export function PendingReviewChip() {
  return <Badge variant="warning">Pendiente de revisión</Badge>;
}

/** El veterinario de la institución que emitió el QR rechazó la autodeclaración. */
export function RejectedChip() {
  return <Badge variant="danger">Rechazada</Badge>;
}

const VISIT_LABELS: Record<
  VisitStatus,
  { label: string; variant: "brand" | "success" | "neutral" | "warning" }
> = {
  "en-espera": { label: "En espera", variant: "brand" },
  "en-atencion": { label: "En atención", variant: "warning" },
  atendida: { label: "Atendida", variant: "success" },
  retirada: { label: "Se retiró", variant: "neutral" },
};

export function VisitStatusChip({ status }: { status: VisitStatus }) {
  const { label, variant } = VISIT_LABELS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function VisitPriorityChip({ priority }: { priority: VisitPriority }) {
  if (priority === "normal") return null;
  return <Badge variant="danger">Urgencia</Badge>;
}

const PROFESSIONAL_LABELS: Record<
  ProfessionalStatus,
  { label: string; variant: "success" | "warning" | "brand" | "neutral" }
> = {
  activo: { label: "Activo", variant: "success" },
  "matricula-pendiente": {
    label: "Matrícula en validación",
    variant: "warning",
  },
  invitado: { label: "Invitación enviada", variant: "brand" },
  inactivo: { label: "Inactivo", variant: "neutral" },
};

export function ProfessionalStatusChip({
  status,
}: {
  status: ProfessionalStatus;
}) {
  const { label, variant } = PROFESSIONAL_LABELS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

// Espejo del CHECK de `appointments.status` (migración 041).
const APPOINTMENT_LABELS: Record<
  AppointmentStatus,
  {
    label: string;
    variant: "brand" | "success" | "warning" | "danger" | "neutral";
  }
> = {
  scheduled: { label: "Agendado", variant: "brand" },
  confirmed: { label: "Confirmado", variant: "success" },
  attended: { label: "Atendido", variant: "neutral" },
  no_show: { label: "No vino", variant: "warning" },
  cancelled: { label: "Cancelado", variant: "danger" },
};

export function AppointmentStatusChip({
  status,
}: {
  status: AppointmentStatus;
}) {
  const { label, variant } = APPOINTMENT_LABELS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
