"use client";

import { Download, FileText, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { PetDocument } from "@/types/pet";

const TYPE_LABELS: Record<PetDocument["tipo"], string> = {
  estudio: "Estudio",
  receta: "Receta",
  certificado: "Certificado",
  otro: "Otro",
};

export function PatientDocuments({
  documents,
  patientName,
}: {
  documents: PetDocument[];
  patientName: string;
}) {
  const [uploading, setUploading] = useState(false);

  return (
    <>
      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin estudios cargados"
          description={`Subí análisis, radiografías o informes de ${patientName}. El dueño los ve al instante.`}
          action={
            <Button onClick={() => setUploading(true)}>Subir estudio</Button>
          }
        />
      ) : (
        <div>
          <div className="mb-4 flex justify-end">
            <Button size="sm" onClick={() => setUploading(true)}>
              <Upload className="size-4" />
              Subir estudio
            </Button>
          </div>

          <Table>
            <THead>
              <tr>
                <TH>Documento</TH>
                <TH>Tipo</TH>
                <TH>Fecha</TH>
                <TH>Tamaño</TH>
                <TH className="text-right">Acciones</TH>
              </tr>
            </THead>
            <TBody>
              {documents.map((document) => (
                <TR key={document.id}>
                  <TD className="font-medium">{document.titulo}</TD>
                  <TD>
                    <Badge variant="neutral">
                      {TYPE_LABELS[document.tipo]}
                    </Badge>
                  </TD>
                  <TD>{formatDate(document.fecha)}</TD>
                  <TD className="text-muted-foreground">{document.tamano}</TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toast.success(`Descargando ${document.archivo}`)
                      }
                    >
                      <Download className="size-4" />
                      Descargar
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <Modal
        open={uploading}
        onClose={() => setUploading(false)}
        title="Subir estudio"
        description={`Queda en la ficha de ${patientName} y en los documentos del dueño.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setUploading(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                toast.success("Estudio subido y compartido con el dueño.");
                setUploading(false);
              }}
            >
              Subir
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Título" htmlFor="titulo-estudio" required>
            <Input
              id="titulo-estudio"
              placeholder="Hemograma completo, radiografía de tórax..."
            />
          </Field>

          <Field label="Tipo" htmlFor="tipo-estudio" required>
            <Select id="tipo-estudio" defaultValue="estudio">
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Fecha" htmlFor="fecha-estudio" required>
            <Input id="fecha-estudio" type="date" />
          </Field>

          <Field
            label="Archivo"
            htmlFor="archivo-estudio"
            hint="PDF o imagen, hasta 10 MB."
            required
          >
            <Input id="archivo-estudio" type="file" className="h-auto py-2.5" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
