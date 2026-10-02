"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  addVaccination,
  updateVaccination,
} from "@/features/owner/actions/health-records-actions";
import type { Vaccination } from "@/types/pet";
import { hoyArgentina } from "@/lib/argentina-time";

export function RecordVaccinationModal({
  open,
  onClose,
  petId,
  petName,
  vaccination,
}: {
  open: boolean;
  onClose: () => void;
  petId: string;
  petName: string;
  vaccination?: Vaccination;
}) {
  const isEdit = Boolean(vaccination);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const [vacuna, setVacuna] = useState(vaccination?.vacuna ?? "");
  const [dosis, setDosis] = useState(vaccination?.dosis ?? "");
  const [fecha, setFecha] = useState(
    () => vaccination?.fechaAplicacion ?? hoyArgentina(),
  );
  const [proximaDosis, setProximaDosis] = useState(
    vaccination?.proximaDosis ?? "",
  );
  const [lugar, setLugar] = useState(vaccination?.lugar ?? "");

  async function handleSave() {
    if (!vacuna.trim() || !fecha) {
      setError("Completá al menos la vacuna y la fecha de aplicación.");
      return;
    }

    setSaving(true);
    setError(undefined);

    const input = {
      vacuna,
      dosis,
      fechaAplicacion: fecha,
      proximaDosis: proximaDosis || undefined,
      lugar,
    };

    const result = vaccination
      ? await updateVaccination(vaccination.id, petId, input)
      : await addVaccination(petId, input);

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    toast.success(
      isEdit
        ? "Se actualizó la vacunación."
        : `Vacunación registrada para ${petName}.`,
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar vacunación" : "Registrar vacunación"}
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
            Los registros cargados por el dueño quedan marcados como{" "}
            <strong>no verificados</strong> hasta que un veterinario los valide.
          </Alert>
        )}

        {error ? <Alert variant="danger">{error}</Alert> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre de la vacuna" htmlFor="vacuna" required>
            <Input
              id="vacuna"
              value={vacuna}
              onChange={(e) => setVacuna(e.target.value)}
              placeholder="Antirrábica, Quíntuple..."
            />
          </Field>
          <Field label="Dosis" htmlFor="dosis">
            <Input
              id="dosis"
              value={dosis}
              onChange={(e) => setDosis(e.target.value)}
              placeholder="1ª dosis, refuerzo anual..."
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha de aplicación" htmlFor="fecha" required>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
          {/* La próxima dosis es lo que alimenta el plan de vacunación y los
              avisos de vencimiento: sin ella la vacuna queda como aplicada y
              nadie recuerda el refuerzo. */}
          <Field
            label="Próxima dosis"
            htmlFor="proximaDosis"
            hint="Opcional. Es lo que dispara el recordatorio."
          >
            <Input
              id="proximaDosis"
              type="date"
              value={proximaDosis}
              onChange={(e) => setProximaDosis(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Lugar de vacunación" htmlFor="lugar">
          <Input
            id="lugar"
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            placeholder="Veterinaria, campaña municipal..."
          />
        </Field>
      </div>
    </Modal>
  );
}
