"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { PendingInvitesList } from "@/features/owner/components/invites/pending-invites-list";
import type { PendingPetInvite } from "@/features/owner/data/owner-queries";

/**
 * Invitaciones a coadministrar, destacadas en el inicio. Antes solo aparecían
 * en `/perfil`, y quien recibía el correo entraba al inicio sin enterarse de
 * que tenía algo por resolver.
 *
 * La lista sale de `listMyPendingPetInvites()` (la misma que usan `/perfil` y
 * la campana). Al resolver una se refresca el layout para que la campana
 * descuente la invitación sin recargar.
 */
export function PendingInvitesCard({
  invitaciones,
}: {
  invitaciones: PendingPetInvite[];
}) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState(invitaciones);

  if (pendientes.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/60 p-5 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <UserPlus className="size-5 text-amber-700 dark:text-amber-300" />
        <h2 className="text-foreground font-semibold">
          {pendientes.length === 1
            ? "Tenés una invitación pendiente"
            : `Tenés ${pendientes.length} invitaciones pendientes`}
        </h2>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Te invitaron a coadministrar una mascota. Aceptá para ver su libreta.
      </p>

      <div className="mt-4">
        <PendingInvitesList
          invitaciones={pendientes}
          onChange={(restantes) => {
            setPendientes(restantes);
            router.refresh();
          }}
        />
      </div>
    </Card>
  );
}
