"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acceptPetShareInvite,
  declinePetShareInvite,
} from "@/features/owner/actions/pet-invites-actions";
import type { PendingPetInvite } from "@/features/owner/data/owner-queries";

/**
 * Un Aceptar/Rechazar por invitación — nunca una acción por lote (spec
 * "Per-Pet Onboarding Acceptance"): resolver una no toca a las demás.
 *
 * Sin encabezado propio a propósito: este componente ahora se usa tanto en
 * el wizard de onboarding como en `/perfil`, y cada caller tiene su propio
 * título ("Tenés invitaciones pendientes" en uno, "Invitaciones pendientes"
 * en el otro) — repetirlo acá adentro lo duplicaría en vez de dejarlo a
 * criterio de quien lo llama.
 *
 * La lista vive en el caller, no acá adentro: este componente es una vista
 * sobre la lista que le pasan y, apenas una acción resuelve una fila, avisa
 * con `onChange` pasando la lista sin esa invitación. Es el caller quien
 * decide qué hacer con el resultado — acá no hay ninguna noción de "paso
 * siguiente".
 */
export function PendingInvitesList({
  invitaciones,
  onChange,
}: {
  invitaciones: PendingPetInvite[];
  onChange: (restantes: PendingPetInvite[]) => void;
}) {
  const [busyId, setBusyId] = useState<string>();

  async function resolver(
    invite: PendingPetInvite,
    accion: "aceptar" | "rechazar",
  ) {
    setBusyId(invite.id);

    const result =
      accion === "aceptar"
        ? await acceptPetShareInvite(invite.id)
        : await declinePetShareInvite(invite.id);

    setBusyId(undefined);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(
      accion === "aceptar"
        ? `Ahora tenés acceso a ${invite.mascota}.`
        : `Rechazaste la invitación de ${invite.mascota}.`,
    );
    onChange(invitaciones.filter((item) => item.id !== invite.id));
  }

  return (
    <ul className="space-y-3">
      {invitaciones.map((invite) => (
        <li key={invite.id} className="border-border rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Avatar name={invite.mascota} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-medium">
                {invite.mascota}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                Invitó {invite.invitadoPor}
              </p>
            </div>
            <Badge variant="neutral">{invite.permiso}</Badge>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={busyId === invite.id}
              onClick={() => resolver(invite, "aceptar")}
            >
              {busyId === invite.id ? "Procesando..." : "Aceptar"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={busyId === invite.id}
              onClick={() => resolver(invite, "rechazar")}
            >
              Rechazar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
