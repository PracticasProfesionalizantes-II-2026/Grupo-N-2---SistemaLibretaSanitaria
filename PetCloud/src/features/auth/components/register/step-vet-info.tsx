"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type VetInfoFormValues,
  vetInfoSchema,
} from "@/features/auth/schemas/auth-schemas";

export function StepVetInfo({
  defaultValues,
  serverError,
  onSubmit: onSubmitProp,
  onBack,
}: {
  defaultValues?: Partial<VetInfoFormValues>;
  /** Error del alta que pertenece a este paso, típicamente la matrícula. */
  serverError?: { field?: "matricula"; message: string };
  onSubmit: (values: VetInfoFormValues) => void | Promise<void>;
  onBack: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VetInfoFormValues>({
    resolver: zodResolver(vetInfoSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit(async (values) => {
    await onSubmitProp(values);
  });

  // La matrícula es única en toda la base: que ya esté tomada solo se sabe al
  // intentar guardarla, así que el mensaje llega del servidor.
  const matriculaError =
    errors.matricula?.message ??
    (serverError?.field === "matricula" ? serverError.message : undefined);

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      {serverError && !serverError.field ? (
        <Alert variant="danger">{serverError.message}</Alert>
      ) : null}

      <Alert variant="info">
        Tu cuenta quedará en revisión hasta validar la matrícula.
      </Alert>

      <Field
        label="Nombre de la veterinaria"
        htmlFor="nombreVeterinaria"
        error={errors.nombreVeterinaria?.message}
        required
      >
        <Input id="nombreVeterinaria" {...register("nombreVeterinaria")} />
      </Field>

      <Field
        label="Dirección"
        htmlFor="direccion"
        error={errors.direccion?.message}
        required
      >
        <Input id="direccion" {...register("direccion")} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Matrícula"
          htmlFor="matricula"
          error={matriculaError}
          hint="Número de matrícula profesional"
          required
        >
          <Input id="matricula" {...register("matricula")} />
        </Field>
        <Field
          label="Teléfono"
          htmlFor="telefono"
          error={errors.telefono?.message}
          required
        >
          <Input id="telefono" type="tel" {...register("telefono")} />
        </Field>
      </div>

      <Field
        label="Página web"
        htmlFor="sitioWeb"
        error={errors.sitioWeb?.message}
        hint="Opcional"
      >
        <Input id="sitioWeb" placeholder="https://" {...register("sitioWeb")} />
      </Field>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1"
        >
          Atrás
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
        </Button>
      </div>
    </form>
  );
}
