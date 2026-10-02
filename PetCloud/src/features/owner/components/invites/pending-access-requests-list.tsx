"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { respondPetAccessRequestAction } from "@/features/owner/actions/pet-access-request-actions";
import type { PendingAccessRequest } from "@/features/owner/actions/pet-access-request-actions";
import { relativeTime } from "@/features/owner/lib/mappers";
import type { Permiso } from "@/features/owner/lib/permissions";

/**
 * Mismas etiquetas que `profile-view` usa para el selector de "Accesos
 * compartidos": ahí no se exportan porque ese archivo las repite a su vez
 * de `share-pet-access-modal` por ser server-only en su origen. Acá pasa lo
 * mismo, así que se repiten en vez de importarlas de un componente de
 * cliente hermano.
 */
const OPCIONES_PERMISO: { value: Permiso; label: string }[] = [
  { value: "view", label: "Solo lectura" },
  { value: "edit", label: "Puede ver y cargar" },
  { value: "owner", label: "Codueño/a" },
];

/**
 * Solicitudes de acceso recibidas de otras personas registradas en el mismo
 * domicilio (spec "Pet Access Requests By Address"). Aceptar revela un
 * selector de permiso porque el RPC otorga ese permiso sobre **todas** las
 * mascotas del dueño que acepta, no una por una — de ahí la advertencia
 * junto al selector.
 *
 * Igual que `PendingInvitesList`: la lista vive en quien llama, este
 * componente solo la muestra y avisa con `onChange` cuándo una fila se
 * resolvió.
 */
export function PendingAccessRequestsList({
  requests,
  onChange,
}: {
  requests: PendingAccessRequest[];
  onChange: (restantes: PendingAccessRequest[]) => void;
}) {
  const [aceptando, setAceptando] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [permisoElegido, setPermisoElegido] = useState<Permiso>("view");

  function iniciarAceptar(request: PendingAccessRequest) {
    setAceptando(request.id);
    setPermisoElegido("view");
  }

  function cancelarAceptar() {
    setAceptando(undefined);
  }

  async function confirmarAceptar(request: PendingAccessRequest) {
    setBusyId(request.id);

    let result;
    try {
      result = await respondPetAccessRequestAction({
        requestId: request.id,
        accept: true,
        permission: permisoElegido,
      });
    } catch {
      setBusyId(undefined);
      toast.error("No pudimos procesar la solicitud. Probá de nuevo.");
      return;
    }

    setBusyId(undefined);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setAceptando(undefined);
    toast.success(`Le diste acceso a ${request.requesterNombre}.`);
    onChange(requests.filter((item) => item.id !== request.id));
  }

  async function rechazar(request: PendingAccessRequest) {
    setBusyId(request.id);

    let result;
    try {
      result = await respondPetAccessRequestAction({
        requestId: request.id,
        accept: false,
      });
    } catch {
      setBusyId(undefined);
      toast.error("No pudimos procesar la solicitud. Probá de nuevo.");
      return;
    }

    setBusyId(undefined);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Rechazaste la solicitud de ${request.requesterNombre}.`);
    onChange(requests.filter((item) => item.id !== request.id));
  }

  if (requests.length === 0) return null;

  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li key={request.id} className="border-border rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Avatar name={request.requesterNombre} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-medium">
                {request.requesterNombre}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {relativeTime(request.createdAt)}
              </p>
            </div>
          </div>

          {aceptando === request.id ? (
            <div className="border-border mt-3 space-y-3 border-t pt-3">
              <div>
                <label
                  htmlFor={`permiso-${request.id}`}
                  className="text-foreground text-xs font-medium"
                >
                  Permiso a otorgar
                </label>
                <select
                  id={`permiso-${request.id}`}
                  value={permisoElegido}
                  disabled={busyId === request.id}
                  onChange={(event) =>
                    setPermisoElegido(event.target.value as Permiso)
                  }
                  className="border-border bg-card text-foreground focus:border-brand-500 focus:ring-brand-500/20 mt-1 h-9 w-full rounded-lg border px-2 text-xs focus:ring-2 focus:outline-none disabled:opacity-50"
                >
                  {OPCIONES_PERMISO.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>
                      {opcion.label}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground mt-1 text-xs">
                  Se le dará acceso a todas tus mascotas.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={busyId === request.id}
                  onClick={() => confirmarAceptar(request)}
                >
                  {busyId === request.id ? "Procesando..." : "Confirmar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={busyId === request.id}
                  onClick={cancelarAceptar}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={busyId === request.id}
                onClick={() => iniciarAceptar(request)}
              >
                Aceptar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={busyId === request.id}
                onClick={() => rechazar(request)}
              >
                {busyId === request.id ? "Procesando..." : "Rechazar"}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
