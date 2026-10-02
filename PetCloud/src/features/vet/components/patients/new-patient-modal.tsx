"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { breedsBySpecies } from "@/features/owner/schemas/pet-schema";
import {
  type NewPatientValues,
  newPatientSchema,
} from "@/features/vet/schemas/vet-schemas";

export function NewPatientModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    register,
    setValue,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewPatientValues>({ resolver: zodResolver(newPatientSchema) });

  const especie = useWatch({ control, name: "especie" });
  const breeds = breedsBySpecies[especie ?? "perro"] ?? breedsBySpecies.perro;

  const onSubmit = handleSubmit(async (values) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    toast.success(
      `${values.nombre} quedó registrado. Se le envió a ${values.duenoEmail} la invitación para activar la cuenta.`,
    );
    reset();
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo paciente"
      description="Alta rápida para poder atender ahora. El dueño completa el resto al activar su cuenta."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-patient-form" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Dar de alta"}
          </Button>
        </>
      }
    >
      <form
        noValidate
        id="new-patient-form"
        onSubmit={onSubmit}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nombre de la mascota"
            htmlFor="nombre"
            error={errors.nombre?.message}
            required
          >
            <Input id="nombre" {...register("nombre")} />
          </Field>

          <Field
            label="Especie"
            htmlFor="especie"
            error={errors.especie?.message}
            required
          >
            <Select
              id="especie"
              defaultValue=""
              {...register("especie", {
                // Cambiar de especie deja huérfana la raza ya elegida: "Siamés"
                // no existe entre las razas de perro, y sin limpiar el campo la
                // combinación imposible se guardaba igual.
                onChange: () => setValue("raza", ""),
              })}
            >
              <option value="" disabled>
                Elegí una opción
              </option>
              <option value="perro">Perro</option>
              <option value="gato">Gato</option>
              <option value="otro">Otro</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Raza"
            htmlFor="raza"
            error={errors.raza?.message}
            required
          >
            <Select id="raza" defaultValue="" {...register("raza")}>
              <option value="" disabled>
                Elegí una opción
              </option>
              {breeds.map((breed) => (
                <option key={breed} value={breed}>
                  {breed}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Sexo"
            htmlFor="sexo"
            error={errors.sexo?.message}
            required
          >
            <Select id="sexo" defaultValue="" {...register("sexo")}>
              <option value="" disabled>
                Elegí una opción
              </option>
              <option value="macho">Macho</option>
              <option value="hembra">Hembra</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Fecha de nacimiento"
            htmlFor="fechaNacimiento"
            error={errors.fechaNacimiento?.message}
            hint="Aproximada si no se conoce"
            required
          >
            <Input
              id="fechaNacimiento"
              type="date"
              {...register("fechaNacimiento")}
            />
          </Field>

          <Field
            label="Peso (kg)"
            htmlFor="pesoKg"
            error={errors.pesoKg?.message}
            required
          >
            <Input
              id="pesoKg"
              type="number"
              step="0.1"
              min="0"
              {...register("pesoKg", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <div className="border-border border-t pt-5">
          <h3 className="text-foreground text-sm font-semibold">Dueño</h3>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nombre y apellido"
              htmlFor="duenoNombre"
              error={errors.duenoNombre?.message}
              required
            >
              <Input id="duenoNombre" {...register("duenoNombre")} />
            </Field>

            <Field
              label="DNI"
              htmlFor="duenoDni"
              error={errors.duenoDni?.message}
              required
            >
              <Input id="duenoDni" {...register("duenoDni")} />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Teléfono"
              htmlFor="duenoTelefono"
              error={errors.duenoTelefono?.message}
              required
            >
              <Input id="duenoTelefono" {...register("duenoTelefono")} />
            </Field>

            <Field
              label="Email"
              htmlFor="duenoEmail"
              error={errors.duenoEmail?.message}
              required
            >
              <Input id="duenoEmail" type="email" {...register("duenoEmail")} />
            </Field>
          </div>
        </div>

        <Alert variant="info">
          Al dar de alta se genera el QR de la mascota y se le envía al dueño
          una invitación para activar su cuenta gratuita.
        </Alert>
      </form>
    </Modal>
  );
}
