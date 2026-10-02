"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrengthMeter } from "@/components/ui/password-strength-meter";
import {
  type AccountFormValues,
  accountSchema,
} from "@/features/auth/schemas/auth-schemas";
import { useFormDraft } from "@/lib/use-form-draft";

export function StepAccount({
  defaultValues,
  serverError,
  onNext,
}: {
  defaultValues?: Partial<AccountFormValues>;
  /** Error que volvió del alta y pertenece a este paso (típicamente el email). */
  serverError?: { field?: "email"; message: string };
  onNext: (values: AccountFormValues) => void;
}) {
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues,
  });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = form;

  // Nunca las contraseñas: el borrador es para no retipear nombre/apellido/
  // email si la persona se va a mitad del alta, no para guardarlas.
  const { clearDraft } = useFormDraft("registro-cuenta", form, [
    "password",
    "confirmPassword",
  ]);

  const password = useWatch({ control, name: "password" });

  const onSubmit = handleSubmit((values) => {
    clearDraft();
    onNext(values);
  });

  // El error del servidor se muestra hasta que se reenvía el formulario, que es
  // cuando react-hook-form vuelve a validar y toma el control del campo.
  const emailError =
    errors.email?.message ??
    (serverError?.field === "email" ? serverError.message : undefined);

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      {serverError && !serverError.field ? (
        <Alert variant="danger">{serverError.message}</Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Nombre"
          htmlFor="nombre"
          error={errors.nombre?.message}
          required
        >
          <Input
            id="nombre"
            autoComplete="given-name"
            {...register("nombre")}
          />
        </Field>
        <Field
          label="Apellido"
          htmlFor="apellido"
          error={errors.apellido?.message}
          required
        >
          <Input
            id="apellido"
            autoComplete="family-name"
            {...register("apellido")}
          />
        </Field>
      </div>

      <Field label="Email" htmlFor="email" error={emailError} required>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
      </Field>

      <Field
        label="Contraseña"
        htmlFor="password"
        error={errors.password?.message}
        required
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          {...register("password")}
        />
        <PasswordStrengthMeter password={password ?? ""} />
      </Field>

      <Field
        label="Confirmar contraseña"
        htmlFor="confirmPassword"
        error={errors.confirmPassword?.message}
        required
      >
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
      </Field>

      <Field error={errors.aceptaTerminos?.message}>
        <label className="text-muted-foreground flex items-start gap-2 text-sm">
          <Checkbox {...register("aceptaTerminos")} />
          {/* Todo el texto en un solo `span` para que fluya como un párrafo:
              si cada fragmento cuelga directo del `label` (flex), el navegador
              trata cada palabra/link como un ítem de flex separado y el corte
              de línea reordena visualmente el texto en vez de ajustarlo. */}
          <span>
            Acepto los{" "}
            <Link
              href="/legales/terminos"
              className="text-brand-600 hover:underline"
            >
              términos
            </Link>{" "}
            y la{" "}
            <Link
              href="/legales/privacidad"
              className="text-brand-600 hover:underline"
            >
              política de privacidad
            </Link>
          </span>
        </label>
      </Field>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Guardando..." : "Continuar"}
      </Button>
    </form>
  );
}
