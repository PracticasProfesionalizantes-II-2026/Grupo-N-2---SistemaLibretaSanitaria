"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitContactMessage } from "@/features/public-site/actions/contact-actions";
import {
  type ContactFormData,
  type ContactFormValues,
  contactSchema,
} from "@/features/public-site/schemas/contact-schema";

/**
 * Formulario de contacto / solicitar demo.
 *
 * `defaultTipo` viene preseleccionado según desde dónde se abre: la landing de
 * veterinarias manda "veterinaria", la de municipios manda "municipio".
 * `variant` decide si se muestra el campo de organización y ciudad (los que
 * pide el formulario institucional).
 */
export function ContactForm({
  defaultTipo,
  variant = "completo",
  organizacionLabel = "Organización",
}: {
  defaultTipo?: ContactFormValues["tipo"];
  variant?: "completo" | "corto";
  organizacionLabel?: string;
}) {
  const [enviado, setEnviado] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues, unknown, ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: { tipo: defaultTipo },
  });

  /**
   * Antes esto era `await new Promise(r => setTimeout(r, 700))` y siempre
   * terminaba en la pantalla de éxito: el mensaje no se guardaba en ningún
   * lado y la persona se iba convencida de que lo habíamos recibido. Ahora la
   * pantalla de éxito depende de que la acción haya escrito la fila, y el
   * fallo se muestra en vez de taparse.
   */
  const onSubmit = handleSubmit(async (values) => {
    const resultado = await submitContactMessage(values);

    if (!resultado.success) {
      setError("root", { message: resultado.error });
      return;
    }

    setEnviado(true);
  });

  if (enviado) {
    return (
      <div className="border-border bg-card rounded-xl border p-8 text-center">
        <span className="bg-success-soft text-success mx-auto flex size-14 items-center justify-center rounded-full">
          <CheckCircle2 className="size-6" />
        </span>
        <h3 className="text-foreground mt-5 text-lg font-bold">
          Recibimos tu mensaje
        </h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Te vamos a responder dentro de las próximas 48 horas hábiles al email
          que nos dejaste.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            reset();
            setEnviado(false);
          }}
        >
          Enviar otro mensaje
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="border-border bg-card space-y-5 rounded-xl border p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Nombre y apellido"
          htmlFor="nombre"
          error={errors.nombre?.message}
          required
        >
          <Input id="nombre" autoComplete="name" {...register("nombre")} />
        </Field>

        <Field
          label="Email"
          htmlFor="email"
          error={errors.email?.message}
          required
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Teléfono"
          htmlFor="telefono"
          error={errors.telefono?.message}
          required
        >
          <Input
            id="telefono"
            type="tel"
            autoComplete="tel"
            {...register("telefono")}
          />
        </Field>

        {variant === "completo" ? (
          <Field
            label="Soy"
            htmlFor="tipo"
            error={errors.tipo?.message}
            required
          >
            <Select
              id="tipo"
              defaultValue={defaultTipo ?? ""}
              {...register("tipo")}
            >
              <option value="" disabled>
                Elegí una opción
              </option>
              <option value="dueno">Dueño de mascota</option>
              <option value="veterinaria">Veterinaria</option>
              <option value="municipio">Municipio</option>
            </Select>
          </Field>
        ) : (
          <Field label={organizacionLabel} htmlFor="organizacion">
            <Input id="organizacion" {...register("organizacion")} />
          </Field>
        )}
      </div>

      {variant === "corto" ? (
        <>
          <input type="hidden" {...register("tipo")} value={defaultTipo} />
          <Field label="Ciudad" htmlFor="ciudad">
            <Input id="ciudad" {...register("ciudad")} />
          </Field>
        </>
      ) : null}

      <Field
        label="Mensaje"
        htmlFor="mensaje"
        error={errors.mensaje?.message}
        required
      >
        <Textarea
          id="mensaje"
          placeholder="Contanos brevemente qué necesitás."
          {...register("mensaje")}
        />
      </Field>

      <Field error={errors.aceptaPrivacidad?.message}>
        <label className="text-muted-foreground flex items-start gap-2 text-sm">
          <Checkbox {...register("aceptaPrivacidad")} />
          <span>
            Acepto la{" "}
            <Link
              href="/legales/privacidad"
              className="text-brand-600 hover:underline"
            >
              política de privacidad
            </Link>
            .
          </span>
        </label>
      </Field>

      {errors.root ? (
        <Alert variant="danger">{errors.root.message}</Alert>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Enviando..." : "Enviar mensaje"}
      </Button>
    </form>
  );
}
