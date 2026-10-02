import { UserX } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOutToLogin } from "@/features/auth/actions/session-actions";

/**
 * La pantalla de una cuenta a medio crear. Mismo formato que
 * `AccountUnderReviewPanel`: tampoco es algo que la persona resuelva sola.
 *
 * "Cerrar sesión" es un `<form>` con Server Action y no el hook del cliente:
 * funciona aunque falle la hidratación y no depende de ningún guard.
 */
export function IncompleteAccountPanel({ email }: { email: string }) {
  return (
    <Card className="w-full max-w-md text-center">
      <span className="bg-accent-50 text-accent-600 mx-auto flex size-14 items-center justify-center rounded-full">
        <UserX className="size-6" />
      </span>
      <h1 className="text-foreground mt-5 text-xl font-bold">
        Tu cuenta todavía no está lista
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Tu usuario existe, pero todavía no está asociado a ninguna organización.
        Esto suele resolverse en el día.
      </p>
      {email ? (
        <p className="text-foreground mt-4 text-sm font-medium break-all">
          {email}
        </p>
      ) : null}

      <ButtonLink href="/contacto" className="mt-6 w-full">
        Contactar a soporte
      </ButtonLink>
      <form action={signOutToLogin} className="mt-3">
        <Button type="submit" variant="outline" className="w-full">
          Cerrar sesión
        </Button>
      </form>
    </Card>
  );
}
