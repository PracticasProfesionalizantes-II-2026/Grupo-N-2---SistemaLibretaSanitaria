"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import {
  addMedication,
  updateMedication,
} from "@/features/owner/actions/health-records-actions";
import type { Medication } from "@/types/pet";

export function RecordMedicationModal({
  open,
  onClose,
  petId,
  petName,
  medication,
}: {
  open: boolean;
  onClose: () => void;
  petId: string;
  petName: string;
  medication?: Medication;
}) {
  const isEdit = Boolean(medication);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const [medicamento, setMedicamento] = useState(medication?.medicamento ?? "");
  const [dosis, setDosis] = useState(medication?.dosis ?? "");
  const [frecuencia, setFrecuencia] = useState(medication?.frecuencia ?? "");
  const [desde, setDesde] = useState(medication?.desde ?? "");
  const [hasta, setHasta] = useState(medication?.hasta ?? "");
  const [indicaciones, setIndicaciones] = useState(
    medication?.indicaciones ?? "",
  );
  const [notas, setNotas] = useState(medication?.notasDueno ?? "");

  async function handleSave() {
    if (!medicamento.trim()) {
      setError("Completá al menos el nombre del medicamento.");
      return;
    }

    setSaving(true);
    setError(undefined);

    const input = {
      medicamento,
      dosis,
      frecuencia,
      desde: desde || undefined,
      hasta: hasta || undefined,
      indicaciones,
      notasDueno: notas,
    };

    const result = medication
      ? await updateMedication(medication.id, petId, input)
      : await addMedication(petId, input);

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    toast.success(
      isEdit
        ? "Se actualizó el medicamento."
        : `Medicamento registrado para ${petName}.`,
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar medicamento" : "Registrar medicamento"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {isEdit ? null : (
          <Alert variant="warning">
            Este registro queda marcado como <strong>no verificado</strong>{" "}
            hasta que lo valide un veterinario.
          </Alert>
        )}

        {error ? <Alert variant="danger">{error}</Alert> : null}

        <Field label="Medicamento" htmlFor="medicamento" required>
          <Input
            id="medicamento"
            value={medicamento}
            onChange={(e) => setMedicamento(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Dosis" htmlFor="dosis" required>
            <Input
              id="dosis"
              value={dosis}
              onChange={(e) => setDosis(e.target.value)}
              placeholder="1 comprimido, 5 ml..."
            />
          </Field>
          <Field label="Frecuencia" htmlFor="frecuencia" required>
            <Input
              id="frecuencia"
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value)}
              placeholder="Cada 12 horas, diaria..."
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Desde" htmlFor="desde" required>
            <Input
              id="desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </Field>
          <Field
            label="Hasta"
            htmlFor="hasta"
            hint="Dejalo vacío si es permanente"
          >
            <Input
              id="hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Indicaciones" htmlFor="indicaciones">
          <Textarea
            id="indicaciones"
            value={indicaciones}
            onChange={(e) => setIndicaciones(e.target.value)}
            placeholder="Administrar con la comida..."
          />
        </Field>

        <Field
          label="Tus notas"
          htmlFor="notas"
          hint="Cómo lo tolera, efectos que notaste"
        >
          <Textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
