"use client";

import { Plus, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { deleteWeightRecord } from "@/features/owner/actions/health-records-actions";
import { RecordWeightModal } from "@/features/owner/components/health-modals/record-weight-modal";
import { RecordRowActions } from "@/features/owner/components/pet-profile/record-row-actions";
import { WeightChart } from "@/features/owner/components/pet-profile/weight-chart";
import { formatDate } from "@/lib/format";
import type { WeightEntry } from "@/types/pet";

export function WeightTab({
  petId,
  entries,
  petName,
  fechaNacimiento,
  puedeEditar,
}: {
  /** `edit` u `owner`; la RLS lo exige igual, acá solo se evita ofrecer el botón. */
  puedeEditar: boolean;
  petId: string;
  entries: WeightEntry[];
  petName: string;
  /** Piso para la fecha del pesaje. Vacío cuando la mascota no la tiene cargada. */
  fechaNacimiento?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WeightEntry>();
  const [deleting, setDeleting] = useState<WeightEntry>();
  const [borrando, setBorrando] = useState(false);

  const descending = [...entries].reverse();

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    const result = await deleteWeightRecord(deleting.id, petId);
    setBorrando(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Registro de peso eliminado.");
    setDeleting(undefined);
    router.refresh();
  }

  return (
    <div>
      {puedeEditar ? (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Registrar peso
          </Button>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Sin registros de peso"
          description={`Registrá el peso de ${petName} para ver su evolución en el tiempo.`}
          action={
            puedeEditar ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Registrar peso
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-foreground font-semibold">
              Evolución del peso
            </h2>
            <div className="mt-4">
              <WeightChart entries={entries} />
            </div>
          </Card>

          {/* Vista de tabla: el mismo dato del gráfico, accesible sin depender del color */}
          {/* `min-w-0` neutraliza el `min-w-max` del componente Table solo en
              esta instancia (tailwind-merge le da prioridad a la clase de
              `className`): sin eso la nota larga estira la tabla y obliga a
              scroll horizontal en el celular. El archivo compartido
              `ui/table.tsx` no se toca, porque otras tablas dependen de ese
              scroll. */}
          <Table className="min-w-0">
            <THead>
              <tr>
                <TH>Fecha</TH>
                <TH>Peso</TH>
                {/* La nota no entra como columna en un celular: ver el bloque de abajo. */}
                <TH className="hidden sm:table-cell">Nota</TH>
                <TH className="text-right">Acciones</TH>
              </tr>
            </THead>
            <TBody>
              {descending.map((entry) => (
                <Fragment key={entry.id}>
                  <TR>
                    <TD>{formatDate(entry.fecha)}</TD>
                    <TD className="font-medium tabular-nums">
                      {entry.pesoKg} kg
                    </TD>
                    {/* La nota se acota y envuelve, no se trunca: `truncate` +
                      `title` esconde el resto detrás de un hover que en una
                      pantalla táctil no existe, así que en el celular —donde
                      justamente desborda— el dato quedaría inaccesible.

                      Debajo de `sm` la columna directamente no va. Comprimida a
                      375px le quedaban unos 45px: el texto salía de a dos
                      palabras por línea y una sola fila ocupaba media pantalla.
                      Ahí la nota pasa a la fila de abajo, a todo el ancho. */}
                    <TD className="text-muted-foreground hidden max-w-xs break-words whitespace-normal sm:table-cell">
                      {entry.nota ?? "—"}
                    </TD>
                    <TD>
                      {entry.origen === "dueno" && puedeEditar ? (
                        <RecordRowActions
                          onEdit={() => setEditing(entry)}
                          onDelete={() => setDeleting(entry)}
                          editLabel={`Editar el peso del ${formatDate(entry.fecha)}`}
                          deleteLabel={`Eliminar el peso del ${formatDate(entry.fecha)}`}
                        />
                      ) : null}
                    </TD>
                  </TR>

                  {/* La nota en su propia fila, a todo el ancho, solo en pantallas
                    chicas. `border-0` la pega a la fila de arriba: es el mismo
                    registro, no otro. */}
                  {entry.nota ? (
                    <tr className="sm:hidden">
                      <td
                        colSpan={3}
                        className="text-muted-foreground border-0 px-4 pb-3 text-xs break-words"
                      >
                        {entry.nota}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <RecordWeightModal
        open={open}
        onClose={() => setOpen(false)}
        petId={petId}
        petName={petName}
        fechaNacimiento={fechaNacimiento}
        pesajes={entries}
      />

      {/* La `key` descarta el estado del formulario al cambiar de registro:
          sin ella el modal seguiría mostrando los datos del anterior. */}
      <RecordWeightModal
        key={editing?.id}
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        petId={petId}
        petName={petName}
        fechaNacimiento={fechaNacimiento}
        entry={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title="¿Eliminar el registro de peso?"
        description={
          deleting
            ? `Se va a eliminar el pesaje de ${deleting.pesoKg} kg del ${formatDate(deleting.fecha)}. Esta acción no se puede deshacer.`
            : ""
        }
      />
    </div>
  );
}
