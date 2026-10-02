import { cloneElement, isValidElement, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps) {
  // El mensaje se ata al control por `htmlFor`: así el lector de pantalla lo
  // anuncia al enfocar el campo, y no solo al aparecer. Si el hijo no es un
  // único elemento (o no hay `htmlFor`), queda solo el `role="alert"`.
  const mensajeId = htmlFor ? `${htmlFor}-mensaje` : undefined;
  const mensaje = error ?? hint;
  const control =
    mensajeId && mensaje && isValidElement<Record<string, unknown>>(children)
      ? cloneElement(children, {
          "aria-describedby": mensajeId,
          ...(error ? { "aria-invalid": true } : {}),
        })
      : children;

  return (
    <div className={cn("text-left", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="text-danger"> *</span> : null}
        </Label>
      ) : null}
      {control}
      {error ? (
        <p id={mensajeId} role="alert" className="text-danger mt-1.5 text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={mensajeId} className="text-muted-foreground mt-1.5 text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
