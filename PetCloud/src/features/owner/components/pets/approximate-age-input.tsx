"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { fechaDesdeEdadAproximada } from "@/features/owner/schemas/pet-schema";

/**
 * "No sé la fecha exacta": años + meses que se traducen a una fecha de
 * nacimiento aproximada (hoy en Argentina menos esa edad).
 *
 * No hay columna para marcar la fecha como aproximada y no se agrega una: se
 * guarda como cualquier otra fecha. Quien la llama decide qué hacer con el
 * resultado (en los formularios, `setValue("fechaNacimiento", ...)`); una edad
 * incompleta o en cero devuelve `""`, que el schema rechaza como obligatoria.
 */
export function ApproximateAgeInput({
  onFecha,
}: {
  onFecha: (fecha: string) => void;
}) {
  const [anios, setAnios] = useState("");
  const [meses, setMeses] = useState("");

  function actualizar(nuevosAnios: string, nuevosMeses: string) {
    setAnios(nuevosAnios);
    setMeses(nuevosMeses);
    const fecha = fechaDesdeEdadAproximada(
      Number(nuevosAnios || 0),
      Number(nuevosMeses || 0),
    );
    onFecha(fecha ?? "");
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-muted-foreground text-xs">
        Años
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          max="40"
          step="1"
          value={anios}
          onChange={(e) => actualizar(e.target.value, meses)}
          aria-label="Edad aproximada en años"
        />
      </label>
      <label className="text-muted-foreground text-xs">
        Meses
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          max="11"
          step="1"
          value={meses}
          onChange={(e) => actualizar(anios, e.target.value)}
          aria-label="Meses además de los años"
        />
      </label>
    </div>
  );
}
