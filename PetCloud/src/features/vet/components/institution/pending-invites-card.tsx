"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  resendTeamInvite,
  revokeTeamInvite,
} from "@/features/vet/actions/institution-actions";
import type { OwnerTeamInvite } from "@/features/vet/data/team-invites";

const ROLE_LABELS: Record<OwnerTeamInvite["rol"], string> = {
  professional: "Veterinario",
  assistant: "Recepcionista",
};

/**
 * Invitaciones todavía sin responder, al lado de la tabla de miembros
 * activos — nunca adentro de ella, porque no son la misma fila: una
 * invitación no tiene ficha de profesional hasta que se acepta.
 *
 * `router.refresh()` después de cada acción, mismo criterio que
 * `admin/team-view.tsx`: los wrappers ya invalidan la ruta del lado del
 * servidor (`revalidatePath`), y acá no se mantiene una copia local de la
 * lista que se pueda desincronizar de lo que la base realmente tiene.
 */
export function PendingInvitesCard({
  invitaciones,
}: {
  invitaciones: OwnerTeamInvite[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string>();
  const [revoking, setRevoking] = useState<OwnerTeamInvite | null>(null);

  if (invitaciones.length === 0) return null;

  async function reenviar(invite: OwnerTeamInvite) {
    setBusyId(invite.id);
    const result = await resendTeamInvite(invite.id);
    setBusyId(undefined);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Se reenvió la invitación a ${invite.email}.`);
    router.refresh();
  }

  async function revocar() {
    if (!revoking) return;

    setBusyId(revoking.id);
    const result = await revokeTeamInvite(revoking.id);
    setBusyId(undefined);
    setRevoking(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Se canceló la invitación a ${revoking.email}.`);
    router.refresh();
  }

  return (
    <Card className="p-0">
      <div className="border-border border-b p-5">
        <h2 className="text-foreground font-semibold">
          Invitaciones pendientes
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {invitaciones.length} invitación
          {invitaciones.length === 1 ? "" : "es"} todavía sin responder.
        </p>
      </div>

      <div className="p-5">
        <Table>
          <THead>
            <tr>
              <TH>Email</TH>
              <TH>Rol</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </tr>
          </THead>
          <TBody>
            {invitaciones.map((invite) => (
              <TR key={invite.id}>
                <TD>{invite.email}</TD>
                <TD className="text-muted-foreground">
                  {ROLE_LABELS[invite.rol]}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1.5">
                    {invite.vencida ? (
                      <Badge variant="neutral">Vencida</Badge>
                    ) : (
                      <Badge variant="brand">Pendiente</Badge>
                    )}
                    {/* vet-plan-limits Requirement "A pending invite that no
                        longer fits the plan is refused at acceptance, and
                        flagged before that": el titular lo ve acá antes de
                        que la persona invitada intente aceptar y se
                        encuentre con el rechazo. */}
                    {!invite.aceptable ? (
                      <Badge variant="danger">Sin lugar en el plan</Badge>
                    ) : null}
                  </div>
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => reenviar(invite)}
                      disabled={busyId === invite.id}
                      className="text-brand-700 hover:bg-muted rounded-lg px-2.5 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busyId === invite.id ? "Reenviando..." : "Reenviar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevoking(invite)}
                      disabled={busyId === invite.id}
                      className="text-muted-foreground hover:bg-danger/10 hover:text-danger rounded-lg px-2.5 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancelar
                    </button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={revocar}
        title={`¿Cancelar la invitación a ${revoking?.email ?? ""}?`}
        description="Deja de estar disponible para aceptar. Como esta institución no puede volver a invitar a la misma dirección, si hace falta sumarla más adelante hay que reenviar en vez de cancelar."
        confirmLabel="Cancelar invitación"
      />
    </Card>
  );
}
