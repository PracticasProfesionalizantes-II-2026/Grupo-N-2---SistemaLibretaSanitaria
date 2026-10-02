"use client";

import { Download, FileText, Mail, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import {
  deletePetDocument,
  getDocumentUrl,
} from "@/features/owner/actions/documents-actions";
import { UploadDocumentModal } from "@/features/owner/components/documents/upload-document-modal";
import { etiquetaMascota } from "@/features/owner/lib/pet-label";
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

const CERTIFICATE_SECTIONS = [
  { key: "datos", label: "Datos de la mascota" },
  { key: "vacunas", label: "Vacunas y antiparasitarios" },
  { key: "tratamientos", label: "Medicamentos y tratamientos" },
  { key: "historial", label: "Historial de consultas" },
];

export function DocumentsView({
  documents: all,
}: {
  documents: PetDocument[];
}) {
  const { pets, activePet } = useActivePet();
  const router = useRouter();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<PetDocument>();
  const [borrando, setBorrando] = useState(false);
  const [certPetId, setCertPetId] = useState(activePet?.id ?? "");
  const [sections, setSections] = useState(
    CERTIFICATE_SECTIONS.map((s) => s.key),
  );
  const [generating, setGenerating] = useState(false);

  const documents = all.filter((doc) => doc.petId === certPetId);
  const petName = pets.find((pet) => pet.id === certPetId)?.nombre ?? "";

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    // `archivo` es la ruta dentro del bucket, no una URL: es lo mismo que come
    // `getDocumentUrl` para firmarla.
    const result = await deletePetDocument(
      deleting.id,
      deleting.petId,
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

  function toggleSection(key: string) {
    setSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handleGenerate(action: "descargar" | "email") {
    setGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setGenerating(false);
    toast.success(
      action === "descargar"
        ? `Se descargó la libreta de ${petName}.`
        : `Enviamos la libreta de ${petName} por email.`,
    );
  }

  return (
    <div>
      <PageHeader
        title="Documentos y certificados"
        description="Los archivos de tus mascotas y la generación de la libreta sanitaria en PDF."
        actions={
          <Button onClick={() => setUploadOpen(true)} disabled={!certPetId}>
            <Upload className="size-4" />
            Subir documento
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_24rem]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label
              htmlFor="filtro-mascota"
              className="text-foreground text-sm font-medium"
            >
              Mascota
            </label>
            <Select
              id="filtro-mascota"
              value={certPetId}
              onChange={(event) => setCertPetId(event.target.value)}
              className="h-10 w-auto"
            >
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {etiquetaMascota(pet)}
                </option>
              ))}
            </Select>
          </div>

          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin documentos"
              description={`Todavía no hay archivos cargados para ${petName}.`}
              action={
                <Button onClick={() => setUploadOpen(true)}>
                  <Upload className="size-4" />
                  Subir documento
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
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

                  <button
                    type="button"
                    onClick={() => setDeleting(document)}
                    className="text-muted-foreground hover:bg-muted hover:text-danger flex size-9 shrink-0 items-center justify-center rounded-lg"
                    aria-label={`Eliminar ${document.titulo}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="h-fit p-5">
          <h2 className="text-foreground font-semibold">
            Generar libreta en PDF
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Elegí qué incluir en el certificado de {petName}.
          </p>

          <div className="mt-5 space-y-2">
            {CERTIFICATE_SECTIONS.map((section) => (
              <label
                key={section.key}
                className="border-border hover:bg-muted flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <Checkbox
                  checked={sections.includes(section.key)}
                  onChange={() => toggleSection(section.key)}
                  className="mt-0"
                />
                <span className="text-foreground">{section.label}</span>
              </label>
            ))}
          </div>

          <div className="border-border bg-muted mt-5 rounded-lg border border-dashed p-4">
            <p className="text-muted-foreground text-xs">Vista previa</p>
            <p className="text-foreground mt-1 text-sm font-medium">
              Libreta sanitaria de {petName}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {sections.length} de {CERTIFICATE_SECTIONS.length} secciones
              incluidas
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Button
              onClick={() => handleGenerate("descargar")}
              disabled={generating || sections.length === 0}
            >
              <Download className="size-4" />
              {generating ? "Generando..." : "Descargar PDF"}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleGenerate("email")}
              disabled={generating || sections.length === 0}
            >
              <Mail className="size-4" />
              Enviar por email
            </Button>
          </div>
        </Card>
      </div>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        petId={certPetId}
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
