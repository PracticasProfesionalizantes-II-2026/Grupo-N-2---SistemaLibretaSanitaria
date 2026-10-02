"use client";

import { ChevronDown, PawPrint, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { revokePetShareInvite } from "@/features/owner/actions/pet-invites-actions";
import {
  revokePetAccess,
  updatePetAccessPermission,
} from "@/features/owner/actions/pets-actions";
import type { SharedAccess } from "@/features/owner/data/owner-queries";
import {
  groupSharedAccessByPerson,
  petCountLabel,
} from "@/features/owner/lib/shared-access-grouping";
import type { Permiso } from "@/features/owner/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Las etiquetas viven acá y no se importan de `ETIQUETA_PERMISO`: ese mapa
 * está en `owner-queries`, que es server-only, y esto es un componente de
 * cliente. `share-pet-access-modal` y `profile-view` (antes de que este
 * componente existiera) ya la repetían por el mismo motivo.
 */
const OPCIONES_PERMISO: { value: Permiso; label: string }[] = [
  { value: "view", label: "Solo lectura" },
  { value: "edit", label: "Puede ver y cargar" },
  { value: "owner", label: "Codueño/a" },
];

/**
 * "Accesos compartidos" de `/perfil`, agrupado por persona en vez de por par
 * (persona, mascota): antes de esto, compartir tres mascotas con la misma
 * persona mostraba tres tarjetas casi idénticas, una por mascota. Ahora hay
 * una fila por persona, colapsable, con sus mascotas adentro.
 *
 * El agrupamiento en sí vive en `shared-access-grouping.ts` (función pura,
 * con sus propios tests) — este componente solo la usa y dibuja el
 * acordeón. Las acciones (cambiar permiso, revocar) siguen operando sobre el
 * par (mascota, persona) de siempre: agrupar es una cuestión de presentación,
 * no cambia qué se revoca ni qué permiso se otorga.
 */
export function SharedAccessList({
  sharedAccess,
}: {
  sharedAccess: SharedAccess[];
}) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<SharedAccess | null>(null);
  const [cambiandoPermiso, setCambiandoPermiso] = useState<string | null>(null);
  // Ver el comentario largo en el `<select>` de más abajo: es lo que fuerza
  // al selector controlado a volver al valor real del servidor cuando ese
  // valor no cambió (acción fallida, o suba pendiente de confirmación).
  const [revisionSelectores, setRevisionSelectores] = useState(0);
  const [confirmandoSuba, setConfirmandoSuba] = useState<{
    access: SharedAccess;
    permission: Permiso;
    motivo: string;
  } | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function toggleExpandido(key: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleRevoke() {
    if (!revoking) return;

    // Una invitación pendiente no tiene fila en `pet_shared_access`: llamar
    // a `revokePetAccess` para una de estas borraría cero filas y el botón
    // igual diría "revocado" sin haber tocado nada. `kind` es justo el campo
    // que existe para decidir cuál de las dos acciones corresponde.
    const result =
      revoking.kind === "invite"
        ? await revokePetShareInvite(revoking.id, revoking.petId)
        : await revokePetAccess(revoking.id, revoking.petId);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Acceso revocado.");
    setRevoking(null);
    router.refresh();
  }

  /**
   * Cambiar el permiso de alguien. Del lado del servidor son dos operaciones
   * distintas —bajar se aplica, subir manda una invitación— y por eso el
   * toast se decide con `via` y no acá: la pantalla no adivina cuál de las
   * dos pasó, se lo pregunta a quien lo hizo.
   *
   * El `<select>` es controlado por `access.permission`, que viene del
   * servidor. Como ese valor no cambia ni cuando la acción falla ni cuando la
   * suba queda pendiente, cada desenlace termina en `sincronizarSelectores()`:
   * es lo que devuelve el control a lo que la base realmente tiene.
   */
  async function aplicarPermiso(
    access: SharedAccess,
    permission: Permiso,
    forceResend = false,
  ) {
    setCambiandoPermiso(access.id);

    // Una Server Action puede rechazar en vez de devolver un `ActionResult`
    // —red caída, id viejo tras un deploy— y ahí no hay `result` que mirar.
    // Sin esto el selector se quedaría deshabilitado para siempre, mudo.
    let result;
    try {
      result = await updatePetAccessPermission(
        access.id,
        access.petId,
        access.kind,
        permission,
        forceResend,
      );
    } catch {
      setCambiandoPermiso(null);
      sincronizarSelectores();
      toast.error("No pudimos cambiar el permiso. Probá de nuevo.");
      return;
    }

    setCambiandoPermiso(null);

    if (!result.success) {
      if (result.requiresConfirmation) {
        setConfirmandoSuba({ access, permission, motivo: result.error });
        return;
      }
      sincronizarSelectores();
      toast.error(result.error);
      return;
    }

    setConfirmandoSuba(null);
    sincronizarSelectores();
    toast.success(
      result.via === "invitacion"
        ? `Le mandamos la invitación a ${access.nombre}. El permiso cambia cuando la acepte.`
        : `Cambiamos el permiso de ${access.nombre}.`,
    );
    router.refresh();
  }

  function sincronizarSelectores() {
    setRevisionSelectores((revision) => revision + 1);
  }

  async function confirmarSuba() {
    if (!confirmandoSuba) return;

    await aplicarPermiso(
      confirmandoSuba.access,
      confirmandoSuba.permission,
      true,
    );
  }

  if (sharedAccess.length === 0) {
    // Sin `action`: el botón "Compartir acceso" ya está en el encabezado de
    // la tarjeta que envuelve a este componente, y repetirlo sería un CTA
    // duplicado.
    return (
      <EmptyState
        icon={Users}
        title="Tus mascotas no tienen accesos compartidos"
        description="Con “Compartir acceso” podés invitar a otra persona para que vea o cargue datos de tu mascota. Aparece acá cuando acepta la invitación."
        className="mt-5 py-10"
      />
    );
  }

  const grupos = groupSharedAccessByPerson(sharedAccess);

  return (
    <>
      <ul className="mt-5 space-y-3">
        {grupos.map((grupo) => {
          const abierto = expandidos.has(grupo.key);
          const panelId = `accesos-compartidos-${grupo.key}`;

          return (
            <li key={grupo.key} className="border-border rounded-lg border">
              <button
                type="button"
                onClick={() => toggleExpandido(grupo.key)}
                aria-expanded={abierto}
                aria-controls={panelId}
                className="hover:bg-muted flex w-full items-center gap-3 rounded-lg p-3 text-left"
              >
                <Avatar name={grupo.nombre} size="sm" />

                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    {grupo.nombre}
                  </p>
                  {grupo.email ? (
                    <p className="text-muted-foreground truncate text-xs">
                      {grupo.email}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {grupo.nombre} · {petCountLabel(grupo.accesses.length)}
                  </p>
                </div>

                <ChevronDown
                  className={cn(
                    "text-muted-foreground size-4 shrink-0 transition-transform",
                    abierto && "rotate-180",
                  )}
                />
              </button>

              {abierto ? (
                <div
                  id={panelId}
                  className="border-border space-y-2 border-t p-3"
                >
                  {grupo.accesses.map((access) => (
                    <div
                      key={access.id}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <PawPrint className="text-muted-foreground size-3 shrink-0" />
                        <span className="text-foreground truncate text-sm">
                          {access.mascota}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                        <select
                          key={`${access.id}-${revisionSelectores}`}
                          value={access.permission}
                          disabled={cambiandoPermiso === access.id}
                          onChange={(event) =>
                            aplicarPermiso(
                              access,
                              event.target.value as Permiso,
                            )
                          }
                          aria-label={`Permiso de ${access.nombre} sobre ${access.mascota}`}
                          className="border-border bg-card text-foreground focus:border-brand-500 focus:ring-brand-500/20 h-9 rounded-lg border px-2 text-xs focus:ring-2 focus:outline-none disabled:opacity-50"
                        >
                          {OPCIONES_PERMISO.map((opcion) => (
                            <option key={opcion.value} value={opcion.value}>
                              {opcion.label}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => setRevoking(access)}
                          className="text-muted-foreground hover:bg-muted hover:text-danger flex size-9 shrink-0 items-center justify-center rounded-lg"
                          aria-label={`Revocar acceso de ${access.nombre} a ${access.mascota}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={handleRevoke}
        title="¿Revocar el acceso?"
        description={
          revoking
            ? `${revoking.nombre} va a dejar de tener acceso a ${revoking.mascota}.`
            : ""
        }
        confirmLabel="Revocar"
      />

      <ConfirmDialog
        open={Boolean(confirmandoSuba)}
        // Cancelar deja el permiso como estaba, así que el selector —que
        // mientras el diálogo estuvo abierto mostraba el permiso pedido—
        // tiene que volver al real.
        onClose={() => {
          setConfirmandoSuba(null);
          sincronizarSelectores();
        }}
        onConfirm={confirmarSuba}
        loading={cambiandoPermiso === confirmandoSuba?.access.id}
        title="¿Volver a enviar la invitación?"
        description={confirmandoSuba?.motivo ?? ""}
        confirmLabel="Enviar de nuevo"
      />
    </>
  );
}
