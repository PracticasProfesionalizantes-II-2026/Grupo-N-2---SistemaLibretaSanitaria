import type { Metadata } from "next";

import { requireUser } from "@/features/auth/lib/current-user";
import { TeamInviteAcceptanceList } from "@/features/vet/components/invites/team-invite-acceptance-list";
import { listMyPendingTeamInvites } from "@/features/vet/data/team-invites";

export const metadata: Metadata = { title: "Invitación al equipo" };

/**
 * Aceptación de una invitación al equipo de una veterinaria (058).
 *
 * `requireUser()`, nunca `requireVet()`: quien acepta todavía no tiene fila
 * de `vet_professionals` — es exactamente lo que esta pantalla le va a
 * crear —, y `requireVet()` lo mandaría de vuelta a `/login` antes de que
 * pueda ver nada.
 *
 * Sin id de invitación en la URL: se listan todas las invitaciones
 * pendientes dirigidas al email confirmado de quien entra, mismo criterio
 * que `emailInvitacionEquipo()` no pone ningún token en el link del correo.
 */
export default async function InvitacionEquipoPage() {
  await requireUser();
  const invitaciones = await listMyPendingTeamInvites();

  return (
    <div className="w-full max-w-md">
      <h1 className="text-foreground mb-1 text-xl font-semibold">
        Invitación al equipo
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {invitaciones.length > 0
          ? "Alguien te invitó a sumarte al equipo de una veterinaria en PetCloud."
          : "No tenés invitaciones pendientes en este momento."}
      </p>

      <TeamInviteAcceptanceList invitacionesIniciales={invitaciones} />
    </div>
  );
}
