"use client";

import { PawPrint, Stethoscope } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectableCard } from "@/components/ui/selectable-card";
import type { RoleFormValues } from "@/features/auth/schemas/auth-schemas";

export function StepRole({
  defaultRole,
  onNext,
  onBack,
}: {
  defaultRole?: RoleFormValues["role"];
  onNext: (role: RoleFormValues["role"]) => void | Promise<void>;
  onBack: () => void;
}) {
  const [role, setRole] = useState<RoleFormValues["role"] | undefined>(
    defaultRole,
  );
  // Para el dueño, este botón ya crea la cuenta: el paso siguiente es el correo
  // de confirmación. Por eso espera y avisa, en vez de saltar de pantalla.
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    if (!role) return;

    setSaving(true);
    try {
      await onNext(role);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectableCard
          icon={PawPrint}
          title="Dueño de mascota"
          description="Quiero llevar la libreta sanitaria de mi mascota."
          selected={role === "dueno"}
          onClick={() => setRole("dueno")}
        />
        <SelectableCard
          icon={Stethoscope}
          title="Veterinario"
          description="Atiendo pacientes y quiero cargar consultas y vacunas."
          selected={role === "veterinario"}
          onClick={() => setRole("veterinario")}
        />
      </div>

      <p className="text-muted-foreground text-center text-xs">
        La matrícula del veterinario queda en revisión hasta que PetCloud la
        aprueba. La cuenta de administrador la crea nuestro equipo, no se
        registra desde acá.
      </p>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={saving}
          className="flex-1"
        >
          Atrás
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!role || saving}
          onClick={handleNext}
        >
          {saving ? "Creando cuenta..." : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
