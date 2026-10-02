"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getPostLoginRoute } from "@/config/roles";
import { useSignOut } from "@/features/auth/lib/use-sign-out";
import { acceptTeamInviteSchema } from "@/features/vet/schemas/team-invite-schemas";
import {
  acceptTeamInvite,
  declineTeamInvite,
} from "@/features/vet/actions/team-invite-actions";
import type { MyTeamInvite } from "@/features/vet/data/team-invites";

const ROLE_LABELS: Record<MyTeamInvite["rol"], string> = {
  professional: "Veterinario",
  assistant: "Recepcionista",
};

/**
 * Aceptar/rechazar cada invitación pendiente, una por una — nunca por lote,
 * mismo criterio que `PendingInvitesList` (coautoría de mascotas).
 *
 * El caso `requiresRelogin` corta la lista entera:
 * apenas una aceptación queda con el JWT viejo, entrar a mirar las demás
 * invitaciones con esa misma sesión no tiene sentido — hay que volver a
 * iniciar sesión antes que nada.
 */
export function TeamInviteAcceptanceList({
  invitacionesIniciales,
}: {
  invitacionesIniciales: MyTeamInvite[];
}) {
  const router = useRouter();
  const { signOut } = useSignOut();
  const [pendientes, setPendientes] = useState(invitacionesIniciales);
  const [matriculas, setMatriculas] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();
  const [requiereRelogin, setRequiereRelogin] = useState(false);

  if (requiereRelogin) {
    return (
      <Alert variant="warning">
        <p className="mb-3">
          Te sumaste al equipo, pero tu sesión todavía tiene los datos viejos.
          Cerrá sesión y volvé a entrar para ver el panel de la veterinaria.
        </p>
        <Button size="sm" onClick={() => signOut()}>
          Cerrar sesión
        </Button>
      </Alert>
    );
  }

  if (pendientes.length === 0) return null;

  async function aceptar(invite: MyTeamInvite) {
    // Chequeo de formulario, no de seguridad: `accept_team_invite()` exige
    // la matrícula igual del lado del servidor y fuerza NULL para
    // `assistant` sin confiar en esto. Esto solo
    // evita el viaje al servidor cuando ya se sabe que va a fallar.
    const parsed = acceptTeamInviteSchema(invite.rol).safeParse({
      matricula: matriculas[invite.id],
    });

    if (!parsed.success) {
      setErrores((prev) => ({
        ...prev,
        [invite.id]: parsed.error.issues[0]?.message ?? "Revisá este campo.",
      }));
      return;
    }

    setErrores((prev) => ({ ...prev, [invite.id]: "" }));
    setBusyId(invite.id);
    const result = await acceptTeamInvite({
      inviteId: invite.id,
      matricula: parsed.data.matricula,
    });
    setBusyId(undefined);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    if (result.requiresRelogin) {
      setRequiereRelogin(true);
      return;
    }

    toast.success(`Te sumaste al equipo de ${invite.institucionNombre}.`);
    router.push(getPostLoginRoute("veterinario"));
  }

  async function rechazar(invite: MyTeamInvite) {
    setBusyId(invite.id);
    const result = await declineTeamInvite(invite.id);
    setBusyId(undefined);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Rechazaste la invitación de ${invite.institucionNombre}.`);
    setPendientes((prev) => prev.filter((item) => item.id !== invite.id));
  }

  return (
    <ul className="space-y-4">
      {pendientes.map((invite) => (
        <li key={invite.id} className="border-border rounded-lg border p-4">
          <p className="text-foreground text-sm font-medium">
            {invite.institucionNombre}
          </p>
          <p className="text-muted-foreground text-xs">
            Te invitó {invite.inviterNombre} como {ROLE_LABELS[invite.rol]}
          </p>

          {invite.rol === "professional" ? (
            <Field
              label="Tu matrícula"
              htmlFor={`matricula-${invite.id}`}
              error={errores[invite.id]}
              required
              className="mt-3"
            >
              <Input
                id={`matricula-${invite.id}`}
                value={matriculas[invite.id] ?? ""}
                onChange={(event) =>
                  setMatriculas((prev) => ({
                    ...prev,
                    [invite.id]: event.target.value,
                  }))
                }
                placeholder="Número de matrícula"
              />
            </Field>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={busyId === invite.id}
              onClick={() => aceptar(invite)}
            >
              {busyId === invite.id ? "Procesando..." : "Aceptar"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={busyId === invite.id}
              onClick={() => rechazar(invite)}
            >
              Rechazar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
