"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TREATMENT_FREQUENCIES,
  TREATMENT_TYPES,
  type TreatmentValues,
  treatmentSchema,
} from "@/features/vet/schemas/vet-schemas";

export function TreatmentModal({
  open,
  onClose,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientName: string;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TreatmentValues>({ resolver: zodResolver(treatmentSchema) });

  const onSubmit = handleSubmit(async (values) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    toast.success(
      `${values.medicamento} quedó indicado para ${patientName}. El dueño lo ve en su app.`,
    );
    reset();
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cargar tratamiento"
      description={`Se agrega al historial de ${patientName} y genera el recordatorio del dueño.`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="treatment-form" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar tratamiento"}
          </Button>
        </>
      }
    >
      <form
        noValidate
        id="treatment-form"
        onSubmit={onSubmit}
        className="space-y-5"
      >
        <Field
          label="Medicamento"
          htmlFor="medicamento"
          error={errors.medicamento?.message}
          required
        >
          <Input
            id="medicamento"
            placeholder="Amoxicilina 250 mg, meloxicam..."
            {...register("medicamento")}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Cantidad / dosis"
            htmlFor="cantidad"
            error={errors.cantidad?.message}
            required
          >
            <Input
              id="cantidad"
              placeholder="1 comprimido, 2 ml..."
              {...register("cantidad")}
            />
          </Field>

          <Field
            label="Tipo"
            htmlFor="tipo"
            error={errors.tipo?.message}
            required
          >
            <Select id="tipo" defaultValue="" {...register("tipo")}>
              <option value="" disabled>
                Elegí una opción
              </option>
              {TREATMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Frecuencia de administración"
            htmlFor="frecuencia"
            error={errors.frecuencia?.message}
            required
          >
            <Select id="frecuencia" defaultValue="" {...register("frecuencia")}>
              <option value="" disabled>
                Elegí una opción
              </option>
              {TREATMENT_FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {frequency}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Duración"
            htmlFor="duracion"
            error={errors.duracion?.message}
            required
          >
            <Input
              id="duracion"
              placeholder="7 días, 3 semanas, continuo..."
              {...register("duracion")}
            />
          </Field>
        </div>

        <Field
          label="Indicaciones para el dueño"
          htmlFor="indicaciones"
          hint="Opcional. Se muestran tal cual en la app del dueño."
        >
          <Textarea
            id="indicaciones"
            placeholder="Administrar con la comida. Completar el tratamiento aunque mejore."
            {...register("indicaciones")}
          />
        </Field>
      </form>
    </Modal>
  );
}
