"use client";

import { Eye, PawPrint, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { HealthStatusChip } from "@/components/ui/status-chip";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { useNewPetDialog } from "@/features/owner/components/pets/new-pet-dialog-provider";
import { PetFormModal } from "@/features/owner/components/pets/pet-form-modal";
import { SharePetAccessModal } from "@/features/owner/components/pets/share-pet-access-modal";
import { deletePet } from "@/features/owner/actions/pets-actions";
import { capitalize, formatAge } from "@/lib/format";
import type { Pet } from "@/types/pet";

export function PetsView() {
  const { pets } = useActivePet();
  const router = useRouter();
  // El alta la sirve el shell, así que acá no hay estado de creación: es el
  // mismo formulario que abren el topbar y el inicio.
  const abrirAlta = useNewPetDialog();
  const [editing, setEditing] = useState<Pet | undefined>();
  const [deleting, setDeleting] = useState<Pet | undefined>();
  const [sharing, setSharing] = useState<Pet | undefined>();
  const [borrando, setBorrando] = useState(false);

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    const result = await deletePet(deleting.id);
    setBorrando(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Se eliminó a ${deleting.nombre}.`);
    setDeleting(undefined);
    router.refresh();
  }

  return (
    <div>
      {/* Con la lista vacía el header no lleva acción ni conteo: el único
          llamado a la acción es el del estado vacío, que además explica para
          qué sirve cargar la mascota. Dos botones iguales en la misma pantalla
          no dan a elegir nada, solo hacen dudar. */}
      <PageHeader
        title="Mis mascotas"
        description={
          pets.length === 0
            ? undefined
            : `${pets.length} ${pets.length === 1 ? "mascota registrada" : "mascotas registradas"}`
        }
        actions={
          pets.length === 0 ? undefined : (
            <Button onClick={abrirAlta}>
              <Plus className="size-4" />
              Cargar mascota
            </Button>
          )
        }
      />

      {pets.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title="Todavía no cargaste ninguna mascota"
          description="Cargá tu primera mascota para empezar a llevar su libreta sanitaria digital."
          action={
            <Button onClick={abrirAlta}>
              <Plus className="size-4" />
              Cargar mi primera mascota
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pets.map((pet) => (
            <article
              key={pet.id}
              className="border-border bg-card flex flex-col rounded-xl border p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={pet.nombre}
                    src={pet.fotoUrl}
                    size="lg"
                    expandable
                  />
                  <div>
                    <h2 className="text-foreground font-bold">{pet.nombre}</h2>
                    <p className="text-muted-foreground text-sm">
                      {capitalize(pet.especie)} · {pet.raza}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {/* El peso se omite cuando vale 0: en el alta es
                          opcional, y "0 kg" se lee como un dato real. */}
                      {[
                        formatAge(pet.fechaNacimiento),
                        pet.pesoKg > 0 ? `${pet.pesoKg} kg` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <HealthStatusChip status={pet.estadoSanitario} />
              </div>

              <div className="border-border mt-5 flex gap-2 border-t pt-4">
                <Link
                  href={`/mascotas/${pet.id}`}
                  className="border-border hover:bg-muted text-foreground flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  <Eye className="size-4" />
                  Ver
                </Link>
                <button
                  type="button"
                  onClick={() => setEditing(pet)}
                  className="border-border hover:bg-muted text-foreground flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium"
                  aria-label={`Editar a ${pet.nombre}`}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSharing(pet)}
                  className="border-border hover:bg-muted text-foreground flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium"
                  aria-label={`Compartir acceso a ${pet.nombre}`}
                >
                  <Share2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(pet)}
                  className="border-border hover:bg-danger-soft hover:text-danger text-foreground flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium"
                  aria-label={`Eliminar a ${pet.nombre}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <PetFormModal
        key={editing?.id}
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        pet={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title={`¿Eliminar a ${deleting?.nombre}?`}
        description="Se borra la mascota junto con su historial sanitario, vacunas y documentos. Esta acción no se puede deshacer."
        confirmLabel="Eliminar mascota"
      />

      <SharePetAccessModal
        key={sharing?.id}
        open={Boolean(sharing)}
        onClose={() => setSharing(undefined)}
        lockedPetId={sharing?.id}
      />
    </div>
  );
}
