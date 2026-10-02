"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";

import { ACCEPT_IMAGEN, validarImagenElegida } from "@/lib/image-formats";
import { cn } from "@/lib/utils";

export function ImageUpload({
  label = "Subir imagen",
  hint,
  rounded = "full",
  className,
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  hint?: string;
  rounded?: "full" | "lg";
  className?: string;
  /** Foto ya guardada, si la hay: se muestra como vista previa inicial. */
  value?: string | null;
  /** Se llama con el `File` elegido, o con `null` si se quita la foto. */
  onChange?: (file: File | null) => void;
  /** Mientras la subida está en curso: bloquea elegir o quitar otra vez. */
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [error, setError] = useState<string | null>(null);
  const [roto, setRoto] = useState(false);

  // `value` puede cambiar por fuera: en el perfil, la subida arranca apenas se
  // elige el archivo y al terminar el servidor devuelve la URL definitiva. Sin
  // esto el componente se quedaba con el `blob:` local para siempre y nunca
  // mostraba lo que de verdad quedó guardado — ni se enteraba de que lo
  // guardado había cambiado.
  const [valorVisto, setValorVisto] = useState(value ?? null);
  if ((value ?? null) !== valorVisto) {
    setValorVisto(value ?? null);
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(value ?? null);
    setError(null);
    setRoto(false);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const valido = validarImagenElegida(file);
    if (!valido.ok) {
      setError(valido.error);
      return;
    }

    setError(null);
    setRoto(false);
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    onChange?.(file);
  }

  function handleClear() {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    setRoto(false);
    if (inputRef.current) inputRef.current.value = "";
    onChange?.(null);
  }

  // Una URL guardada puede no cargar: caducó la foto del proveedor externo con
  // la que se creó la cuenta (ver migración 049), el archivo ya no está, o la
  // red falló. Sin `onError` el navegador dibujaba su ícono de imagen rota con
  // el texto alternativo al lado —"Vista previa"— y eso se leía como si el
  // componente estuviera mostrando una etiqueta, no como un error. `Avatar` ya
  // resolvía esto mismo cayendo a las iniciales; acá faltaba.
  const mostrarFoto = preview !== null && !roto;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          // Nombre explícito: con foto cargada el único texto adentro era el
          // `alt` de la vista previa, y el botón se anunciaba "Vista previa".
          aria-label={disabled ? "Subiendo..." : label}
          className={cn(
            "border-border bg-card hover:border-brand-400 flex size-32 items-center justify-center overflow-hidden border-2 border-dashed transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            rounded === "full" ? "rounded-full" : "rounded-xl",
          )}
        >
          {mostrarFoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              onError={() => setRoto(true)}
              className="size-full object-cover"
            />
          ) : (
            <span className="text-muted-foreground flex flex-col items-center gap-1.5">
              <ImagePlus className="size-6" />
              <span className="text-xs font-medium">
                {disabled ? "Subiendo..." : label}
              </span>
            </span>
          )}
        </button>

        {mostrarFoto && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            className="bg-foreground absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-full text-white"
            aria-label="Quitar imagen"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_IMAGEN}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />

      {error ? (
        <p className="text-danger mt-3 text-center text-sm">{error}</p>
      ) : roto ? (
        <p className="text-danger mt-3 text-center text-sm">
          No pudimos cargar la foto guardada. Elegí una nueva.
        </p>
      ) : hint ? (
        <p className="text-muted-foreground mt-3 text-center text-sm">{hint}</p>
      ) : null}
    </div>
  );
}
