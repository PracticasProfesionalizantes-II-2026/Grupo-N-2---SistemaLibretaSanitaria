import { Smartphone } from "lucide-react";

import { Card } from "@/components/ui/card";
import { InstallAppButton } from "@/features/pwa/components/install-app-button";

/**
 * Tarjeta "Aplicación" de Configuración. `conIcono` sigue el estilo de las
 * pantallas cuyos títulos de tarjeta llevan ícono.
 */
export function InstallAppSection({
  conIcono = false,
}: {
  conIcono?: boolean;
}) {
  return (
    <Card className="p-5">
      <h2
        className={
          conIcono
            ? "text-foreground flex items-center gap-2 font-semibold"
            : "text-foreground font-semibold"
        }
      >
        {conIcono ? (
          <Smartphone className="text-brand-600 size-[18px]" />
        ) : null}
        Aplicación
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Instalá PetCloud en este dispositivo para abrirla como una app, sin
        buscarla en el navegador.
      </p>
      <div className="mt-4">
        <InstallAppButton />
      </div>
    </Card>
  );
}
