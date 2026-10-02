"use client";

import { Plus, Syringe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PendingReviewChip,
  RejectedChip,
  UnverifiedChip,
} from "@/components/ui/status-chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { deleteVaccination } from "@/features/owner/actions/health-records-actions";
import { RecordVaccinationModal } from "@/features/owner/components/health-modals/record-vaccination-modal";
import { RecordCard } from "@/features/owner/components/pet-profile/record-card";
import { RecordRowActions } from "@/features/owner/components/pet-profile/record-row-actions";
import { VaccinationPlan } from "@/features/owner/components/health/vaccination-plan";
import type { UpcomingDose } from "@/features/owner/data/health-queries";
import { formatDate } from "@/lib/format";
import type { Vaccination } from "@/types/pet";

const STATUS_VARIANT = {
  aplicada: "success",
  proxima: "warning",
  vencida: "danger",
} as const;

const STATUS_LABEL = {
  aplicada: "Aplicada",
  proxima: "Próxima a vencer",
  vencida: "Vencida",
};

export function VaccinationsTab({
  petId,
  vaccinations,
  petName,
  upcomingDoses,
  puedeEditar,
}: {
  /** `edit` u `owner`; la RLS lo exige igual, acá solo se evita ofrecer el botón. */
  puedeEditar: boolean;
  petId: string;
  vaccinations: Vaccination[];
  petName: string;
  upcomingDoses: UpcomingDose[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vaccination>();
  const [deleting, setDeleting] = useState<Vaccination>();
  const [borrando, setBorrando] = useState(false);

  /**
   * Una dosis autodeclarada contra el QR de una campaña está en la cola de
   * revisión de la institución que emitió el código: mientras alguien con
   * matrícula la mira, el dueño no la toca. La acción la rechaza igual; acá solo
   * se evita ofrecerle un botón que no iba a funcionar.
   */
  const editable = (item: Vaccination) =>
    puedeEditar && item.origen === "dueno" && item.revision === undefined;

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    const result = await deleteVaccination(deleting.id, petId);
    setBorrando(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Vacunación eliminada.");
    setDeleting(undefined);
    router.refresh();
  }

  return (
    <div>
      {upcomingDoses.length > 0 ? (
        <div className="mb-8">
          <VaccinationPlan doses={upcomingDoses} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-foreground font-semibold">Historial completo</h2>
        {puedeEditar ? (
          <Button
            size="sm"
            className="h-11 w-full md:h-9 md:w-auto"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-4" />
            Registrar vacunación
          </Button>
        ) : null}
      </div>

      {vaccinations.length === 0 ? (
        <EmptyState
          icon={Syringe}
          title="Sin vacunas registradas"
          description={`Cargá las vacunas que ya tiene ${petName} o esperá a que las cargue la veterinaria.`}
          action={
            puedeEditar ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Registrar vacunación
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Vacuna</TH>
                  <TH>Dosis</TH>
                  <TH>Aplicación</TH>
                  <TH>Próxima dosis</TH>
                  <TH>Lugar</TH>
                  <TH>Veterinario</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Acciones</TH>
                </tr>
              </THead>
              <TBody>
                {vaccinations.map((item) => (
                  <TR key={item.id}>
                    <TD className="font-medium">
                      <span className="flex items-center gap-2">
                        {item.vacuna}
                        {item.revision === "pendiente" ? (
                          <PendingReviewChip />
                        ) : item.revision === "rechazada" ? (
                          <RejectedChip />
                        ) : item.origen === "dueno" ? (
                          <UnverifiedChip />
                        ) : null}
                      </span>
                    </TD>
                    <TD className="text-muted-foreground">{item.dosis}</TD>
                    <TD>{formatDate(item.fechaAplicacion)}</TD>
                    <TD className="text-muted-foreground">
                      {item.proximaDosis ? formatDate(item.proximaDosis) : "—"}
                    </TD>
                    <TD className="text-muted-foreground">{item.lugar}</TD>
                    <TD className="text-muted-foreground">
                      {item.veterinario ?? "—"}
                    </TD>
                    <TD>
                      <Badge variant={STATUS_VARIANT[item.estado]}>
                        {STATUS_LABEL[item.estado]}
                      </Badge>
                    </TD>
                    <TD>
                      {editable(item) ? (
                        <RecordRowActions
                          onEdit={() => setEditing(item)}
                          onDelete={() => setDeleting(item)}
                          editLabel={`Editar la vacuna ${item.vacuna}`}
                          deleteLabel={`Eliminar la vacuna ${item.vacuna}`}
                        />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {vaccinations.map((item) => (
              <RecordCard
                key={item.id}
                title={item.vacuna}
                badges={
                  item.revision === "pendiente" ? (
                    <PendingReviewChip />
                  ) : item.revision === "rechazada" ? (
                    <RejectedChip />
                  ) : item.origen === "dueno" ? (
                    <UnverifiedChip />
                  ) : null
                }
                status={
                  <Badge variant={STATUS_VARIANT[item.estado]}>
                    {STATUS_LABEL[item.estado]}
                  </Badge>
                }
                dates={[
                  {
                    label: "Aplicación",
                    value: formatDate(item.fechaAplicacion),
                  },
                  {
                    label: "Próxima dosis",
                    value: item.proximaDosis
                      ? formatDate(item.proximaDosis)
                      : "—",
                  },
                ]}
                secondary={
                  <>
                    <p>Lugar: {item.lugar}</p>
                    <p>Veterinario: {item.veterinario ?? "—"}</p>
                    <p>Dosis: {item.dosis}</p>
                  </>
                }
                actions={
                  editable(item) ? (
                    <div className="flex w-full justify-end">
                      <RecordRowActions
                        onEdit={() => setEditing(item)}
                        onDelete={() => setDeleting(item)}
                        editLabel={`Editar la vacuna ${item.vacuna}`}
                        deleteLabel={`Eliminar la vacuna ${item.vacuna}`}
                      />
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        </>
      )}

      <RecordVaccinationModal
        open={open}
        onClose={() => setOpen(false)}
        petId={petId}
        petName={petName}
      />

      {/* La `key` descarta el estado del formulario al cambiar de registro:
          sin ella el modal seguiría mostrando los datos del anterior. */}
      <RecordVaccinationModal
        key={editing?.id}
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        petId={petId}
        petName={petName}
        vaccination={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title="¿Eliminar la vacunación?"
        description={
          deleting
            ? `Se va a eliminar el registro de ${deleting.vacuna}. Esta acción no se puede deshacer.`
            : ""
        }
      />
    </div>
  );
}
