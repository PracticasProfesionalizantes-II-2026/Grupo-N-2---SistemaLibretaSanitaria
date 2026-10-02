"use client";

import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  deletePetDocument,
  getDocumentUrl,
} from "@/features/owner/actions/documents-actions";
import { UploadDocumentModal } from "@/features/owner/components/documents/upload-document-modal";
import { formatDate } from "@/lib/format";
import type { PetDocument } from "@/types/pet";

const TYPE_LABEL: Record<PetDocument["tipo"], string> = {
  estudio: "Estudio",
  receta: "Receta",
  certificado: "Certificado",
  otro: "Otro",
};

async function descargar(document: PetDocument) {
  const result = await getDocumentUrl(document.archivo);
  if (!result.success) {
    toast.error(result.error);
    return;
  }
  window.open(result.url, "_blank");
}

export function DocumentsTab({
  documents,
  petId,
  petName,
  puedeEditar,
}: {
  /** `edit` u `owner`; la RLS lo exige igual, acá solo se evita ofrecer el botón. */
  puedeEditar: boolean;
  documents: PetDocument[];
  petId: string;
  petName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<PetDocument>();
  const [borrando, setBorrando] = useState(false);

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    // `archivo` es la ruta dentro del bucket, no una URL: es lo mismo que come
    // `getDocumentUrl` para firmarla.
    const result = await deletePetDocument(
      deleting.id,
      petId,
      deleting.archivo,
    );
    setBorrando(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Documento eliminado.");
    setDeleting(undefined);
    router.refresh();
  }

  return (
    <div>
      {puedeEditar ? (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Upload className="size-4" />
            Subir documento
          </Button>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description={`Subí estudios, recetas o certificados de ${petName} para tenerlos siempre a mano.`}
          action={
            puedeEditar ? (
              <Button onClick={() => setOpen(true)}>
                <Upload className="size-4" />
                Subir documento
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {documents.map((document) => (
            <li
              key={document.id}
              className="border-border bg-card flex items-center gap-4 rounded-xl border p-4"
            >
              <span className="bg-brand-50 text-brand-700 flex size-11 shrink-0 items-center justify-center rounded-lg">
                <FileText className="size-5" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-medium">
                  {document.titulo}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatDate(document.fecha)} · {document.tamano}
                </p>
              </div>

              <Badge variant="neutral">{TYPE_LABEL[document.tipo]}</Badge>

              <button
                type="button"
                onClick={() => descargar(document)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg"
                aria-label={`Descargar ${document.titulo}`}
              >
                <Download className="size-4" />
              </button>

              {puedeEditar ? (
                <button
                  type="button"
                  onClick={() => setDeleting(document)}
                  className="text-muted-foreground hover:bg-muted hover:text-danger flex size-9 shrink-0 items-center justify-center rounded-lg"
                  aria-label={`Eliminar ${document.titulo}`}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <UploadDocumentModal
        open={open}
        onClose={() => setOpen(false)}
        petId={petId}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title="¿Eliminar el documento?"
        description={
          deleting
            ? `Se va a eliminar "${deleting.titulo}" junto con su archivo. Esta acción no se puede deshacer.`
            : ""
        }
      />
    </div>
  );
}
