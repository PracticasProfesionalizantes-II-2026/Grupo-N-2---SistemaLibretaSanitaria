"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { VACCINE_DOSES, VACCINE_LABS } from "@/config/vet-catalogs";
import {
  createVaccinePreset,
  updateVaccinePreset,
} from "@/features/vet/actions/vaccine-preset-actions";
import { VIAS } from "@/features/vet/components/vaccination/record-vaccination-form";
import {
  type VaccinePresetValues,
  vaccinePresetSchema,
} from "@/features/vet/schemas/vet-schemas";
import type { Species } from "@/types/pet";
import type { VaccinePreset } from "@/types/vet";

/**
 * `createVaccinePreset` guarda la vía como la columna la necesita
 * (`application_route`), a diferencia de `recordVaccination` que recibe la
 * etiqueta en español y la traduce puertas adentro. Acá se traduce antes de
 * llamar a la acción para no cambiarle la firma a código que ya funciona.
 */
const VIA_DB: Record<
  (typeof VIAS)[number],
  "injectable" | "oral" | "nasal" | "topical" | "other"
> = {
  Inyectable: "injectable",
  Oral: "oral",
  Nasal: "nasal",
  Tópica: "topical",
  Otra: "other",
};

const ESPECIES: { value: Species; label: string }[] = [
  { value: "perro", label: "Perro" },
  { value: "gato", label: "Gato" },
  { value: "otro", label: "Otro" },
];

export function VaccinePresetModal({
  open,
  onClose,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  /** Si viene un preset, el modal edita; sin él, da de alta uno nuevo. */
  preset?: VaccinePreset;
}) {
  const isEdit = Boolean(preset);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VaccinePresetValues>({
    resolver: zodResolver(vaccinePresetSchema),
    defaultValues: preset
      ? {
          vacuna: preset.vacuna,
          laboratorio: preset.laboratorio,
          via: preset.via,
          dosisPorDefecto: preset.dosisPorDefecto,
          intervaloMeses: preset.intervaloMeses,
          especies: preset.especies,
          obligatoria: preset.obligatoria,
        }
      : { especies: [], obligatoria: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    const input = {
      vacuna: values.vacuna,
      laboratorio: values.laboratorio,
      via: VIA_DB[values.via as (typeof VIAS)[number]],
      especies: values.especies,
      dosisPorDefecto: values.dosisPorDefecto,
      intervaloMeses: values.intervaloMeses,
      obligatoria: values.obligatoria,
    };

    const result =
      isEdit && preset
        ? await updateVaccinePreset(preset.id, input)
        : await createVaccinePreset(input);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(
      isEdit
        ? `Se actualizó ${values.vacuna}.`
        : `${values.vacuna} se agregó al catálogo.`,
    );
    router.refresh();
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Editar ${preset?.vacuna}` : "Nueva vacuna"}
      description="Estos datos se reusan en el modo campaña y al cargar una vacunación: no hace falta volver a escribirlos por cada dosis."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="vaccine-preset-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <form
        noValidate
        id="vaccine-preset-form"
        onSubmit={onSubmit}
        className="space-y-5"
      >
        <Field
          label="Nombre de la vacuna"
          htmlFor="vacuna"
          error={errors.vacuna?.message}
          required
        >
          <Input
            id="vacuna"
            placeholder="Antirrábica"
            {...register("vacuna")}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Laboratorio / marca"
            htmlFor="laboratorio"
            error={errors.laboratorio?.message}
            required
          >
            <Select
              id="laboratorio"
              defaultValue=""
              {...register("laboratorio")}
            >
              <option value="" disabled>
                Elegí una opción
              </option>
              {VACCINE_LABS.map((lab) => (
                <option key={lab} value={lab}>
                  {lab}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Vía de aplicación"
            htmlFor="via"
            error={errors.via?.message}
            required
          >
            <Select id="via" defaultValue="" {...register("via")}>
              <option value="" disabled>
                Elegí una opción
              </option>
              {VIAS.map((route) => (
                <option key={route} value={route}>
                  {route}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Dosis por defecto"
            htmlFor="dosisPorDefecto"
            error={errors.dosisPorDefecto?.message}
            required
          >
            <Select
              id="dosisPorDefecto"
              defaultValue=""
              {...register("dosisPorDefecto")}
            >
              <option value="" disabled>
                Elegí una opción
              </option>
              {VACCINE_DOSES.map((dose) => (
                <option key={dose} value={dose}>
                  {dose}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Intervalo hasta el refuerzo (meses)"
            htmlFor="intervaloMeses"
            error={errors.intervaloMeses?.message}
            required
          >
            <Input
              id="intervaloMeses"
              type="number"
              min="1"
              step="1"
              {...register("intervaloMeses", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <div>
          <p className="text-foreground mb-2 text-sm font-medium">
            Especies aplicables <span className="text-danger">*</span>
          </p>
          <div className="flex flex-wrap gap-4">
            {ESPECIES.map((especie) => (
              <label
                key={especie.value}
                className="text-foreground flex items-center gap-2 text-sm"
              >
                <Checkbox
                  value={especie.value}
                  className="mt-0"
                  {...register("especies")}
                />
                {especie.label}
              </label>
            ))}
          </div>
          {errors.especies ? (
            <p className="text-danger mt-1.5 text-sm">
              {errors.especies.message}
            </p>
          ) : null}
        </div>

        <label className="text-foreground flex items-center gap-2 text-sm">
          <Checkbox {...register("obligatoria")} className="mt-0" />
          Es una vacuna obligatoria
        </label>

        <Alert variant="info">
          Las obligatorias aparecen primero en la lista y ya vienen elegidas al
          armar un operativo de campaña.
        </Alert>
      </form>
    </Modal>
  );
}
