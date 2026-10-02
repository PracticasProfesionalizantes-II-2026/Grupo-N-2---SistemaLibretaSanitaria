"use client";

import { Bug, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { UnverifiedChip } from "@/components/ui/status-chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { deleteDeworming } from "@/features/owner/actions/health-records-actions";
import { RecordAntiparasiticModal } from "@/features/owner/components/health-modals/record-antiparasitic-modal";
import { RecordCard } from "@/features/owner/components/pet-profile/record-card";
import { RecordRowActions } from "@/features/owner/components/pet-profile/record-row-actions";
import { formatDate } from "@/lib/format";
import type { Antiparasitic } from "@/types/pet";

export function AntiparasiticsTab({
  petId,
  antiparasitics,
  petName,
  puedeEditar,
}: {
  /** `edit` u `owner`; la RLS lo exige igual, acá solo se evita ofrecer el botón. */
  puedeEditar: boolean;
  petId: string;
  antiparasitics: Antiparasitic[];
  petName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Antiparasitic>();
  const [deleting, setDeleting] = useState<Antiparasitic>();
  const [borrando, setBorrando] = useState(false);

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    const result = await deleteDeworming(deleting.id, petId);
    setBorrando(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Antiparasitario eliminado.");
    setDeleting(undefined);
    router.refresh();
  }

  return (
    <div>
      {puedeEditar ? (
        <div className="mb-4 flex justify-end">
          <Button
            size="sm"
            className="h-11 w-full md:h-9 md:w-auto"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-4" />
            Registrar antiparasitario
          </Button>
        </div>
      ) : null}

      {antiparasitics.length === 0 ? (
        <EmptyState
          icon={Bug}
          title="Sin antiparasitarios registrados"
          description={`Registrá las desparasitaciones de ${petName} para llevar el control de las próximas aplicaciones.`}
          action={
            puedeEditar ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Registrar antiparasitario
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
                  <TH>Producto</TH>
                  <TH>Tipo</TH>
                  <TH>Aplicación</TH>
                  <TH>Próxima aplicación</TH>
                  <TH className="text-right">Acciones</TH>
                </tr>
              </THead>
              <TBody>
                {antiparasitics.map((item) => (
                  <TR key={item.id}>
                    <TD className="font-medium">
                      <span className="flex items-center gap-2">
                        {item.producto}
                        {item.origen === "dueno" ? <UnverifiedChip /> : null}
                      </span>
                    </TD>
                    <TD>
                      <Badge variant="neutral">
                        {item.tipo === "interno" ? "Interno" : "Externo"}
                      </Badge>
                    </TD>
                    <TD>{formatDate(item.fecha)}</TD>
                    <TD className="text-muted-foreground">
                      {item.proximaAplicacion
                        ? formatDate(item.proximaAplicacion)
                        : "—"}
                    </TD>
                    <TD>
                      {item.origen === "dueno" && puedeEditar ? (
                        <RecordRowActions
                          onEdit={() => setEditing(item)}
                          onDelete={() => setDeleting(item)}
                          editLabel={`Editar el antiparasitario ${item.producto}`}
                          deleteLabel={`Eliminar el antiparasitario ${item.producto}`}
                        />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {antiparasitics.map((item) => (
              <RecordCard
                key={item.id}
                title={item.producto}
                badges={item.origen === "dueno" ? <UnverifiedChip /> : null}
                status={
                  <Badge variant="neutral">
                    {item.tipo === "interno" ? "Interno" : "Externo"}
                  </Badge>
                }
                dates={[
                  { label: "Aplicación", value: formatDate(item.fecha) },
                  {
                    label: "Próxima aplicación",
                    value: item.proximaAplicacion
                      ? formatDate(item.proximaAplicacion)
                      : "—",
                  },
                ]}
                actions={
                  item.origen === "dueno" && puedeEditar ? (
                    <div className="flex w-full justify-end">
                      <RecordRowActions
                        onEdit={() => setEditing(item)}
                        onDelete={() => setDeleting(item)}
                        editLabel={`Editar el antiparasitario ${item.producto}`}
                        deleteLabel={`Eliminar el antiparasitario ${item.producto}`}
                      />
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        </>
      )}

      <RecordAntiparasiticModal
        open={open}
        onClose={() => setOpen(false)}
        petId={petId}
        petName={petName}
      />

      {/* La `key` descarta el estado del formulario al cambiar de registro:
          sin ella el modal seguiría mostrando los datos del anterior. */}
      <RecordAntiparasiticModal
        key={editing?.id}
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        petId={petId}
        petName={petName}
        antiparasitic={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title="¿Eliminar el antiparasitario?"
        description={
          deleting
            ? `Se va a eliminar el registro de ${deleting.producto}. Esta acción no se puede deshacer.`
            : ""
        }
      />
    </div>
  );
}
