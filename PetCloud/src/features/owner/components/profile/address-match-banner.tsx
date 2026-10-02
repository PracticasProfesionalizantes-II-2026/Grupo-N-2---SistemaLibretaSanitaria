"use client";

import { Home } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createPetAccessRequestAction } from "@/features/owner/actions/pet-access-request-actions";

/**
 * Se muestra solo cuando `checkMatchingPetsAction()` (llamado en el server,
 * en `page.tsx`) encontró mascotas de otros dueños en el mismo domicilio.
 *
 * A propósito no muestra ni nombres de dueños ni datos de sus mascotas: la
 * privacidad de esa gente no depende de que este componente se porte bien,
 * pero tampoco hay que darle motivos. El único dato que cruza el server es un
 * número.
 */
export function AddressMatchBanner({ count }: { count: number }) {
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || count <= 0) return null;

  async function handleRequest() {
    setSending(true);

    let result;
    try {
      result = await createPetAccessRequestAction();
    } catch {
      setSending(false);
      toast.error("No pudimos enviar la solicitud. Probá de nuevo.");
      return;
    }

    setSending(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setDismissed(true);
    if (result.created === 0) {
      toast.success("Ya les habíamos mandado la solicitud a esos dueños.");
    } else if (result.notified) {
      toast.success("Le avisamos a los dueños de tu domicilio.");
    } else {
      toast.success(
        "Enviamos la solicitud, pero no pudimos avisarles a los dueños. La van a ver al entrar a su perfil.",
      );
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Home className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium">
            {count === 1
              ? "Encontramos 1 mascota registrada en tu domicilio."
              : `Encontramos ${count} mascotas registradas en tu domicilio.`}{" "}
            ¿Querés solicitar acceso a sus dueños?
          </p>

          <div className="mt-3 flex justify-end">
            <Button size="sm" disabled={sending} onClick={handleRequest}>
              {sending ? "Enviando..." : "Solicitar acceso"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
