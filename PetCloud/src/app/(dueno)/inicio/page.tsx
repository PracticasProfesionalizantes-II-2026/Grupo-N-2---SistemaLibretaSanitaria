import type { Metadata } from "next";

import { DashboardAside } from "@/features/owner/components/dashboard/dashboard-aside";
import { DashboardView } from "@/features/owner/components/dashboard/dashboard-view";
import { PendingInvitesCard } from "@/features/owner/components/dashboard/pending-invites-card";
import { UpcomingAppointmentsWidget } from "@/features/owner/components/dashboard/upcoming-appointments-widget";
import { getOwnerUpcomingAppointments } from "@/features/owner/data/appointment-queries";
import { listMyPendingPetInvites } from "@/features/owner/data/owner-queries";

export const metadata: Metadata = { title: "Inicio" };

export default async function InicioPage() {
  // La columna lateral consulta la base, así que se resuelve en el servidor y
  // entra en la vista —que es cliente— ya renderizada.
  const [turnos, invitaciones] = await Promise.all([
    getOwnerUpcomingAppointments(),
    listMyPendingPetInvites(),
  ]);

  return (
    <DashboardView
      aside={<DashboardAside />}
      turnos={<UpcomingAppointmentsWidget turnos={turnos} />}
      invitaciones={
        invitaciones.length > 0 ? (
          <PendingInvitesCard invitaciones={invitaciones} />
        ) : null
      }
    />
  );
}
