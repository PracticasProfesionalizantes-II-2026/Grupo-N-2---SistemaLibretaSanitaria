"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { getLibretaData } from "@/features/owner/actions/pdf-actions";
import {
  generarLibretaPdf,
  type SeccionLibreta,
} from "@/features/owner/lib/libreta-pdf";
import type { Pet } from "@/types/pet";

/**
 * Descargar la libreta sanitaria.
 *
 * El PDF se arma en el navegador: el servidor solo junta los datos. Eso incluye
 * las URLs firmadas de las imágenes de firma, que se descargan acá y se
 * incrustan en el documento.
 */

const SECTIONS: { key: SeccionLibreta; label: string; hint: string }[] = [
  {
    key: "datos",
    label: "Datos de la mascota",
    hint: "Especie, raza, señas, microchip y tus datos de contacto.",
  },
  {
    key: "vacunas",
    label: "Vacunas y antiparasitarios",
    hint: "Con fecha de aplicación, próxima dosis y quién la aplicó.",
  },
  {
    key: "tratamientos",
    label: "Medicamentos y tratamientos",
    hint: "Los que están en curso y los que ya terminaron.",
  },
  {
    key: "historial",
    label: "Historial de consultas",
    hint: "Solo las consultas firmadas por un profesional, con su firma.",
  },
];

export function GeneratePdfModal({
  open,
  onClose,
  pet,
}: {
  open: boolean;
  onClose: () => void;
  pet: Pet;
}) {
  const [selected, setSelected] = useState<SeccionLibreta[]>(
    SECTIONS.map((s) => s.key),
  );
  const [generating, setGenerating] = useState(false);

  function toggle(key: SeccionLibreta) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handleGenerate() {
    setGenerating(true);

    try {
      const datos = await getLibretaData(pet.id);

      if (!datos) {
        toast.error("No pudimos leer la libreta de esta mascota.");
        return;
      }

      const blob = await generarLibretaPdf(datos, selected);

      // La descarga se dispara con un enlace temporal y se revoca enseguida:
      // el blob puede pesar y no hay motivo para dejarlo vivo en memoria.
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `libreta-${pet.nombre.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);

      toast.success(`Se descargó la libreta sanitaria de ${pet.nombre}.`);
      onClose();
    } catch (error) {
      toast.error(
        `No pudimos armar el PDF: ${(error as Error).message}. Probá de nuevo.`,
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Descargar libreta en PDF"
      description={`Elegí qué información incluir en la libreta de ${pet.nombre}.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={generating}>
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || selected.length === 0}
          >
            {generating ? "Armando el PDF..." : "Descargar PDF"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <label
            key={section.key}
            className="border-border hover:bg-muted flex items-start gap-3 rounded-lg border p-3 text-sm"
          >
            <Checkbox
              checked={selected.includes(section.key)}
              onChange={() => toggle(section.key)}
              className="mt-0.5"
            />
            <span>
              <span className="text-foreground block font-medium">
                {section.label}
              </span>
              <span className="text-muted-foreground block text-xs">
                {section.hint}
              </span>
            </span>
          </label>
        ))}
      </div>

      <Alert variant="info" className="mt-5">
        <span className="flex items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0" />
          <span>
            El PDF se arma en tu dispositivo con los datos de la libreta. Las
            consultas firmadas van con la firma del profesional que las hizo.
          </span>
        </span>
      </Alert>
    </Modal>
  );
}
