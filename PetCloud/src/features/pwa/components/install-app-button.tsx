"use client";

import { CircleCheck, Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { InstallInstructionsModal } from "@/features/pwa/components/install-instructions";
import { useSituacionInstalacion } from "@/features/pwa/hooks/use-install-situation";
import { pedirInstalacion } from "@/features/pwa/lib/install-prompt";

type Props = {
  label?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
};

/**
 * Botón para instalar PetCloud que nunca queda muerto.
 *
 * Si el navegador ofreció el instalador nativo, lo abre. En cualquier otro
 * caso abre las instrucciones para ese navegador. Antes de hidratar no se
 * sabe nada, así que no se renderiza: un botón deshabilitado sin explicación
 * sería peor que ninguno.
 */
export function InstallAppButton({
  label = "Descargar aplicación",
  variant,
  size,
  className,
}: Props) {
  const situacion = useSituacionInstalacion();
  const [pidiendo, setPidiendo] = useState(false);
  const [instruccionesAbiertas, setInstruccionesAbiertas] = useState(false);

  if (situacion === null) return null;

  if (situacion === "instalada") {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <CircleCheck className="text-brand-600 size-4" />
        Ya tenés la app instalada en este dispositivo
      </p>
    );
  }

  async function onClick() {
    if (situacion !== "instalable") {
      setInstruccionesAbiertas(true);
      return;
    }

    setPidiendo(true);
    const resultado = await pedirInstalacion();
    setPidiendo(false);
    // Sin instalador disponible el store ya pasó a otra situación (en
    // Chromium, `manual`): se explica cómo hacerlo desde el menú.
    if (resultado === "no-disponible") setInstruccionesAbiertas(true);
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={onClick}
        disabled={pidiendo}
      >
        <Download className="size-4" />
        {pidiendo ? "Abriendo el instalador..." : label}
      </Button>

      <InstallInstructionsModal
        open={instruccionesAbiertas}
        onClose={() => setInstruccionesAbiertas(false)}
        situacion={situacion}
      />
    </>
  );
}
