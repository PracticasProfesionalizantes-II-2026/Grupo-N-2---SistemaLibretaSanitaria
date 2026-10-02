import { Clock } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * La matrícula del veterinario está esperando que un administrador de
 * PetCloud la valide (`/admin/validaciones`). Sin matrícula validada se entra
 * igual al panel: lo que se pierde es la firma, no el acceso.
 */
export function AccountUnderReviewPanel() {
  return (
    <Card className="w-full max-w-md text-center">
      <span className="bg-accent-50 text-accent-600 mx-auto flex size-14 items-center justify-center rounded-full">
        <Clock className="size-6" />
      </span>
      <h1 className="text-foreground mt-5 text-xl font-bold">
        Tu cuenta está en revisión
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Nuestro equipo está validando tu matrícula profesional. Mientras tanto
        podés terminar de configurar tu veterinaria.
      </p>

      <ButtonLink
        href="/onboarding/veterinario"
        variant="outline"
        className="mt-6 w-full"
      >
        Continuar con la configuración
      </ButtonLink>

      <p className="text-muted-foreground mt-6 text-sm">
        <Link href="/" className="text-brand-600 font-medium hover:underline">
          Volver al inicio
        </Link>
      </p>
    </Card>
  );
}
