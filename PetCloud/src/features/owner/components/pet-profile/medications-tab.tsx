"use client";

import { Pill, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { UnverifiedChip } from "@/components/ui/status-chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { deleteMedication } from "@/features/owner/actions/health-records-actions";
import { RecordMedicationModal } from "@/features/owner/components/health-modals/record-medication-modal";
import { RecordRowActions } from "@/features/owner/components/pet-profile/record-row-actions";
import { formatDate } from "@/lib/format";
import type { Medication } from "@/types/pet";

export function MedicationsTab({
  petId,
  medications,
  petName,
  puedeEditar,
}: {
  /** `edit` u `owner`; la RLS lo exige igual, acá solo se evita ofrecer el botón. */
  puedeEditar: boolean;
  petId: string;
  medications: Medication[];
  petName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Medication>();
  const [deleting, setDeleting] = useState<Medication>();
  const [borrando, setBorrando] = useState(false);

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    const result = await deleteMedication(deleting.id, petId);
    setBorrando(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Medicamento eliminado.");
    setDeleting(undefined);
    router.refresh();
  }

  return (
    <div>
      {puedeEditar ? (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Registrar medicamento
          </Button>
        </div>
      ) : null}

      {medications.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="Sin medicamentos registrados"
          description={`Acá vas a ver la medicación indicada para ${petName}, con sus dosis y duración.`}
          action={
            puedeEditar ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Registrar medicamento
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Medicamento</TH>
              <TH>Dosis</TH>
              <TH>Frecuencia</TH>
              <TH>Desde / hasta</TH>
              <TH>Indicaciones</TH>
              <TH>Tus notas</TH>
              <TH className="text-right">Acciones</TH>
            </tr>
          </THead>
          <TBody>
            {medications.map((item) => (
              <TR key={item.id}>
                <TD className="font-medium">
                  <span className="flex items-center gap-2">
                    {item.medicamento}
                    {item.origen === "dueno" ? <UnverifiedChip /> : null}
                  </span>
                </TD>
                <TD className="text-muted-foreground">{item.dosis}</TD>
                <TD className="text-muted-foreground">{item.frecuencia}</TD>
                <TD className="text-muted-foreground">
                  {formatDate(item.desde)}
                  {item.hasta ? ` → ${formatDate(item.hasta)}` : " → en curso"}
                </TD>
                <TD className="text-muted-foreground max-w-64 whitespace-normal">
                  {item.indicaciones}
                </TD>
                <TD className="text-muted-foreground max-w-64 whitespace-normal">
                  {item.notasDueno ?? "—"}
                </TD>
                <TD>
                  {item.origen === "dueno" && puedeEditar ? (
                    <RecordRowActions
                      onEdit={() => setEditing(item)}
                      onDelete={() => setDeleting(item)}
                      editLabel={`Editar el medicamento ${item.medicamento}`}
                      deleteLabel={`Eliminar el medicamento ${item.medicamento}`}
                    />
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <RecordMedicationModal
        open={open}
        onClose={() => setOpen(false)}
        petId={petId}
        petName={petName}
      />

      {/* La `key` descarta el estado del formulario al cambiar de registro:
          sin ella el modal seguiría mostrando los datos del anterior. */}
      <RecordMedicationModal
        key={editing?.id}
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        petId={petId}
        petName={petName}
        medication={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title="¿Eliminar el medicamento?"
        description={
          deleting
            ? `Se va a eliminar el registro de ${deleting.medicamento}. Esta acción no se puede deshacer.`
            : ""
        }
      />
    </div>
  );
}
