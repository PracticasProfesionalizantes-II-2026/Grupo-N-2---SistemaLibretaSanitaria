"use client";

import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { deleteVaccinePreset } from "@/features/vet/actions/vaccine-preset-actions";
import { VaccinePresetModal } from "@/features/vet/components/vaccine-catalog/vaccine-preset-modal";
import { capitalize } from "@/lib/format";
import type { VaccinePreset } from "@/types/vet";

/**
 * Catálogo de vacunas de la institución: alta, edición y baja de presets.
 *
 * Existe porque el combo "Vacuna" de "Cargar vacunación" lee estos presets
 * (`getVaccinePresets`) y, sin una pantalla para cargarlos, aparecía vacío: el
 * veterinario no tenía forma de darle contenido al catálogo de su propia
 * institución.
 *
 * Es un bloque sin `PageHeader` propio a propósito: dejó de tener ruta y ahora
 * se despliega dentro de Vacunaciones, que es donde el veterinario ya está
 * parado cuando descubre que le falta una vacuna en el combo. El encabezado lo
 * pone quien lo embebe.
 */
export function VaccineCatalogManager({
  presets,
}: {
  presets: VaccinePreset[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VaccinePreset | undefined>();
  const [removing, setRemoving] = useState<VaccinePreset | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!removing) return;

    setDeleting(true);
    const result = await deleteVaccinePreset(removing.id);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`${removing.vacuna} se quitó del catálogo.`);
    setRemoving(null);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Laboratorio, vía, dosis e intervalo de cada vacuna que ofrece la
          institución. El modo campaña y la carga de vacunación reusan estos
          datos.
        </p>
        <Button className="shrink-0" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Nueva vacuna
        </Button>
      </div>

      {presets.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Todavía no cargaste ninguna vacuna"
          description="Agregá al menos una para poder elegirla al cargar una vacunación o armar un operativo de campaña."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Nueva vacuna
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Vacuna</TH>
              <TH>Laboratorio</TH>
              <TH>Vía / dosis</TH>
              <TH>Especies</TH>
              <TH>Refuerzo</TH>
              <TH>Obligatoria</TH>
              <TH className="text-right">Acciones</TH>
            </tr>
          </THead>
          <TBody>
            {presets.map((preset) => (
              <TR key={preset.id}>
                <TD className="font-medium">{preset.vacuna}</TD>
                <TD className="text-muted-foreground">{preset.laboratorio}</TD>
                <TD className="text-muted-foreground">
                  {preset.via} · {preset.dosisPorDefecto}
                </TD>
                <TD className="text-muted-foreground">
                  {preset.especies.map(capitalize).join(", ")}
                </TD>
                <TD className="text-muted-foreground">
                  {preset.intervaloMeses} meses
                </TD>
                <TD>
                  {preset.obligatoria ? (
                    <Badge variant="brand">Obligatoria</Badge>
                  ) : (
                    <Badge variant="neutral">No</Badge>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(preset)}
                      className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center rounded-lg"
                      aria-label={`Editar ${preset.vacuna}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(preset)}
                      className="text-muted-foreground hover:bg-danger/10 hover:text-danger flex size-8 items-center justify-center rounded-lg"
                      aria-label={`Eliminar ${preset.vacuna}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <VaccinePresetModal open={creating} onClose={() => setCreating(false)} />
      <VaccinePresetModal
        key={editing?.id}
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        preset={editing}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={handleDelete}
        title={`¿Eliminar ${removing?.vacuna ?? ""}?`}
        description="Se quita del catálogo de la institución. Las vacunaciones ya aplicadas con este preset no se modifican: quedan con los datos que tenían al aplicarse."
        confirmLabel="Eliminar"
        loading={deleting}
      />
    </div>
  );
}
