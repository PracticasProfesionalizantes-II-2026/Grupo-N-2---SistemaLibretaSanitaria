"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { uploadPetDocument } from "@/features/owner/actions/documents-actions";

/**
 * Mismo tope y mismos tipos que anuncia el propio texto de esta pantalla
 * ("PDF, JPG o PNG, hasta 10 MB"): rechazar antes de subir evita el viaje al
 * servidor para algo que igual va a rebotar allá (la validación real está en
 * `uploadPetDocument`, esto es solo para no hacerle esperar el round-trip).
 */
const TIPOS_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

function validarArchivo(file: File): string | null {
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return "Solo se aceptan archivos PDF, JPG o PNG.";
  }
  if (file.size > MAX_BYTES) {
    return "El archivo no puede pesar más de 10 MB.";
  }
  return null;
}

export function UploadDocumentModal({
  open,
  onClose,
  petId,
}: {
  open: boolean;
  onClose: () => void;
  petId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("");
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function resetear() {
    setFile(null);
    setTitulo("");
    setTipo("");
    setFecha("");
    setError(null);
  }

  function elegirArchivo(selected: File | null) {
    if (!selected) {
      setFile(null);
      return;
    }

    const problema = validarArchivo(selected);
    if (problema) {
      setError(problema);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setError(null);
    setFile(selected);
  }

  async function handleSave() {
    if (!file) {
      setError("Elegí un archivo para subir.");
      return;
    }
    if (!titulo.trim()) {
      setError("Poné un título para el documento.");
      return;
    }
    if (!tipo) {
      setError("Elegí un tipo de documento.");
      return;
    }

    setError(null);
    setSaving(true);

    const formData = new FormData();
    formData.set("archivo", file);
    formData.set("titulo", titulo.trim());
    formData.set("tipo", tipo);
    if (fecha) formData.set("fecha", fecha);

    const result = await uploadPetDocument(petId, formData);
    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    toast.success("Documento subido correctamente.");
    resetear();
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        resetear();
        onClose();
      }}
      title="Subir documento"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Subiendo..." : "Subir"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="border-border hover:border-brand-400 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors"
        >
          <Upload className="text-muted-foreground size-6" />
          <span className="text-foreground text-sm font-medium">
            {file?.name ?? "Elegí un archivo"}
          </span>
          <span className="text-muted-foreground text-xs">
            PDF, JPG o PNG, hasta 10 MB
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(event) => elegirArchivo(event.target.files?.[0] ?? null)}
        />

        <Field label="Título" htmlFor="titulo" required>
          <Input
            id="titulo"
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="tipo" required>
            <Select
              id="tipo"
              value={tipo}
              onChange={(event) => setTipo(event.target.value)}
            >
              <option value="" disabled>
                Elegí una opción
              </option>
              <option value="estudio">Estudio</option>
              <option value="receta">Receta</option>
              <option value="certificado">Certificado</option>
              <option value="otro">Otro</option>
            </Select>
          </Field>

          <Field label="Fecha" htmlFor="fecha" hint="Opcional">
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
            />
          </Field>
        </div>

        {error ? <p className="text-danger text-sm">{error}</p> : null}
      </div>
    </Modal>
  );
}
