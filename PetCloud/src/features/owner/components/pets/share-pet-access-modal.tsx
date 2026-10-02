"use client";

import { Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { sharePetAccess } from "@/features/owner/actions/pets-actions";

type Permiso = "view" | "edit" | "owner";

/**
 * Compartir una mascota, en el lugar donde se pidió — nunca navegando a otra
 * pantalla. Antes esto vivía solo en `/perfil`, y tanto la tarjeta de "Mis
 * mascotas" como el encabezado de la ficha de una mascota la abrían con un
 * `<Link href="/perfil?compartir=...">`, que sacaba a la persona de donde
 * estaba parada — justo lo que no se quiere después de compartir una
 * mascota puntual.
 *
 * `lockedPetId` es la diferencia entre los dos usos: si se pasa, el modal
 * comparte esa única mascota y ni siquiera muestra el selector; si no se
 * pasa (el caso de `/perfil`, donde no hay ninguna mascota en contexto),
 * muestra el selector completo con "Todas mis mascotas" incluido.
 */
export function SharePetAccessModal({
  open,
  onClose,
  pets,
  lockedPetId,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  /** Solo hace falta cuando no hay `lockedPetId`: es lo que llena el selector. */
  pets?: { id: string; nombre: string }[];
  lockedPetId?: string;
  /** Corre después de un compartir 100% exitoso, antes de `onClose`. */
  onShared?: () => void;
}) {
  const router = useRouter();
  const [sharingBusy, setSharingBusy] = useState(false);
  // Mismo campo que en pets-actions.ts: `restantes`/`total` distinguen "todas
  // mis mascotas" de una sola, para que el toast final y el reintento tras
  // confirmar sepan si falta más por procesar.
  const [confirmandoReenvio, setConfirmandoReenvio] = useState<{
    petId: string;
    email: string;
    permiso: Permiso;
    restantes: string[];
    total: number;
    mensaje: string;
    /** Cuántas mascotas ya se saltearon antes de esta pausa, para no perderlas al retomar. */
    skipsAcumulados: number;
  } | null>(null);
  const [reenviando, setReenviando] = useState(false);

  async function handleShare() {
    const email = (
      document.getElementById("share-email") as HTMLInputElement | null
    )?.value;
    const petSeleccionado = lockedPetId
      ? lockedPetId
      : (document.getElementById("share-pet") as HTMLSelectElement | null)
          ?.value;
    const permiso = (
      document.getElementById("share-perm") as HTMLSelectElement | null
    )?.value;

    if (!email || !petSeleccionado) {
      toast.error("Completá el email y elegí una mascota.");
      return;
    }

    const nivel: Permiso =
      permiso === "owner" || permiso === "edit" ? permiso : "view";

    setSharingBusy(true);

    // "Todas mis mascotas" no es un id real: `sharePetAccess` espera el uuid
    // de UNA mascota, así que se llama una vez por cada una en vez de mandar
    // el string "todas" (que reventaría contra la columna uuid de la base).
    const objetivos =
      petSeleccionado === "todas"
        ? (pets ?? []).map((pet) => pet.id)
        : [petSeleccionado];

    await procesarCompartir(objetivos, email, nivel, objetivos.length);
  }

  /**
   * Corre `sharePetAccess` mascota por mascota. Si alguna devuelve
   * `requiresConfirmation` (email con una invitación ya rechazada para esa
   * mascota puntual), se corta acá — sin reintentar solo — y se abre el
   * `ConfirmDialog` de más abajo con lo que falta por procesar. Un error
   * cualquiera corta todo.
   *
   * `result.yaTeniaAcceso` no corta nada: es un skip, no un error — el
   * destinatario ya tenía ese permiso o uno mayor para esa mascota puntual, y
   * el bucle sigue con el resto. `skipsPrevios` existe porque una pausa por
   * `requiresConfirmation` no puede perder la cuenta de lo ya salteado antes
   * de esa pausa.
   */
  async function procesarCompartir(
    objetivos: string[],
    email: string,
    nivel: Permiso,
    total: number,
    skipsPrevios = 0,
  ) {
    let skips = skipsPrevios;

    for (let i = 0; i < objetivos.length; i += 1) {
      const idMascota = objetivos[i];
      const result = await sharePetAccess(idMascota, email, nivel);

      if (!result.success && result.requiresConfirmation) {
        setSharingBusy(false);
        setConfirmandoReenvio({
          petId: idMascota,
          email,
          permiso: nivel,
          restantes: objetivos.slice(i + 1),
          total,
          mensaje: result.error,
          skipsAcumulados: skips,
        });
        return;
      }

      if (!result.success) {
        setSharingBusy(false);
        toast.error(result.error);
        return;
      }

      if (result.yaTeniaAcceso) skips += 1;
    }

    setSharingBusy(false);

    if (skips === total) {
      toast.success(
        total > 1
          ? "Esa persona ya tenía acceso a todas tus mascotas."
          : "Esa persona ya tiene acceso a esta mascota.",
      );
    } else if (skips > 0) {
      toast.success(
        "Invitación enviada. Esa persona ya tenía acceso a alguna de tus mascotas, así que esas no cambian.",
      );
    } else {
      toast.success(
        total > 1
          ? "Se envió la invitación a todas tus mascotas."
          : "Invitación enviada.",
      );
    }

    onShared?.();
    onClose();
    router.refresh();
  }

  /**
   * Confirmación explícita del reenvío (spec "Re-Inviting a Declined Email
   * Requires Owner Confirmation"): recién acá se repite exactamente el mismo
   * llamado con `forceResend: true`, nunca antes. Si "Todas mis mascotas"
   * dejó más mascotas por procesar, se retoma con las que faltaban.
   */
  async function handleConfirmarReenvio() {
    if (!confirmandoReenvio) return;
    const { petId, email, permiso, restantes, total, skipsAcumulados } =
      confirmandoReenvio;

    setReenviando(true);
    const result = await sharePetAccess(petId, email, permiso, true);
    setReenviando(false);

    if (!result.success) {
      toast.error(result.error);
      setConfirmandoReenvio(null);
      return;
    }

    setConfirmandoReenvio(null);
    setSharingBusy(true);
    await procesarCompartir(
      restantes,
      email,
      permiso,
      total,
      result.yaTeniaAcceso ? skipsAcumulados + 1 : skipsAcumulados,
    );
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Compartir acceso"
        description="La persona va a poder ver la libreta sanitaria de la mascota que elijas."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleShare} disabled={sharingBusy}>
              <Share2 className="size-4" />
              {sharingBusy ? "Compartiendo..." : "Enviar invitación"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Email de la persona" htmlFor="share-email" required>
            <Input id="share-email" type="email" />
          </Field>

          {lockedPetId ? null : (
            <Field label="Mascota" htmlFor="share-pet" required>
              <select
                id="share-pet"
                defaultValue="todas"
                className="border-border bg-card text-foreground focus:border-brand-500 focus:ring-brand-500/20 h-11 w-full rounded-lg border px-3 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="todas">Todas mis mascotas</option>
                {(pets ?? []).map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.nombre}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label="Permisos"
            htmlFor="share-perm"
            required
            hint="Codueño/a es distinto de los otros dos: además de ver y cargar, va a figurar como dueño de la mascota (recibe los avisos de vacunas, sale como contacto si se pierde, y puede a su vez compartir o revocar accesos)."
          >
            <select
              id="share-perm"
              defaultValue="view"
              className="border-border bg-card text-foreground focus:border-brand-500 focus:ring-brand-500/20 h-11 w-full rounded-lg border px-3 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="view">Solo lectura</option>
              <option value="edit">Puede ver y cargar registros</option>
              <option value="owner">Es codueño/a (acceso total)</option>
            </select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmandoReenvio)}
        onClose={() => setConfirmandoReenvio(null)}
        onConfirm={handleConfirmarReenvio}
        title="¿Reenviar la invitación?"
        description={confirmandoReenvio?.mensaje ?? ""}
        confirmLabel="Reenviar invitación"
        loading={reenviando}
        loadingLabel="Reenviando..."
        variant="primary"
      />
    </>
  );
}
