"use client";

import { HeartPulse, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteCondition } from "@/features/owner/actions/health-records-actions";
import { RecordConditionModal } from "@/features/owner/components/health-modals/record-condition-modal";
import { RecordRowActions } from "@/features/owner/components/pet-profile/record-row-actions";
import { formatLongDate } from "@/lib/format";
import type { Condition } from "@/types/pet";

export function ConditionsTab({
  petId,
  conditions,
  petName,
  puedeEditar,
}: {
  /** `edit` u `owner`; la RLS lo exige igual, acá solo se evita ofrecer el botón. */
  puedeEditar: boolean;
  petId: string;
  conditions: Condition[];
  petName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Condition>();
  const [deleting, setDeleting] = useState<Condition>();
  const [borrando, setBorrando] = useState(false);

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    const result = await deleteCondition(deleting.id, petId);
    setBorrando(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Condición eliminada.");
    setDeleting(undefined);
    router.refresh();
  }

  return (
    <div>
      {puedeEditar ? (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Registrar condición
          </Button>
        </div>
      ) : null}

      {conditions.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="Sin enfermedades ni alergias registradas"
          description={`${petName} no tiene condiciones crónicas ni alergias cargadas en su historial.`}
          action={
            puedeEditar ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Registrar condición
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {conditions.map((condition) => (
            <Card key={condition.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-foreground font-semibold">
                  {condition.nombre}
                </h2>
                <Badge
                  variant={condition.tipo === "alergia" ? "warning" : "brand"}
                >
                  {condition.tipo === "alergia" ? "Alergia" : "Enfermedad"}
                </Badge>
              </div>

              <p className="text-muted-foreground mt-3 text-sm">
                {condition.descripcion}
              </p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs">
                  Diagnosticada el {formatLongDate(condition.fechaDiagnostico)}
                </p>
                {condition.origen === "dueno" && puedeEditar ? (
                  <RecordRowActions
                    onEdit={() => setEditing(condition)}
                    onDelete={() => setDeleting(condition)}
                    editLabel={`Editar ${condition.nombre}`}
                    deleteLabel={`Eliminar ${condition.nombre}`}
                  />
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <RecordConditionModal
        open={open}
        onClose={() => setOpen(false)}
        petId={petId}
        petName={petName}
      />

      {/* La `key` descarta el estado del formulario al cambiar de registro:
          sin ella el modal seguiría mostrando los datos del anterior. */}
      <RecordConditionModal
        key={editing?.id}
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        petId={petId}
        petName={petName}
        condition={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title="¿Eliminar la condición?"
        description={
          deleting
            ? `Se va a eliminar el registro de ${deleting.nombre}. Esta acción no se puede deshacer.`
            : ""
        }
      />
    </div>
  );
}
