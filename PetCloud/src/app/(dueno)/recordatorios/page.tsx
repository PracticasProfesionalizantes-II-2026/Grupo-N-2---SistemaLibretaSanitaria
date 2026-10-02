import type { Metadata } from "next";

import { UpcomingAppointmentsSection } from "@/features/owner/components/reminders/upcoming-appointments-section";
import { RemindersView } from "@/features/owner/components/reminders/reminders-view";
import { getOwnerUpcomingAppointments } from "@/features/owner/data/appointment-queries";
import { listMyReminders } from "@/features/owner/data/owner-queries";

export const metadata: Metadata = { title: "Recordatorios" };

export default async function RecordatoriosPage() {
  // En paralelo: son dos consultas independientes y encadenarlas sumaría las
  // dos latencias sin ganar nada.
  const [reminders, turnos] = await Promise.all([
    listMyReminders(),
    getOwnerUpcomingAppointments(10),
  ]);

  return (
    <RemindersView
      reminders={reminders}
      turnos={<UpcomingAppointmentsSection turnos={turnos} />}
    />
  );
}
