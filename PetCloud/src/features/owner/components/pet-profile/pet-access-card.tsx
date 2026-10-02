import { Users } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PetAccess } from "@/features/owner/data/owner-queries";

/**
 * Quién más entra a la ficha de esta mascota.
 *
 * Es de solo lectura a propósito: dar y revocar accesos vive en Perfil, que es
 * donde está el botón de compartir y el historial completo. Duplicar esas
 * acciones acá sería tener dos lugares desde donde revocar lo mismo, y el día
 * que una cambie la otra queda vieja. Lo que falta en la ficha no es la
 * gestión, es la respuesta a "¿quién ve esto además de mí?".
 */
export function PetAccessCard({
  acceso,
  petName,
}: {
  acceso: PetAccess;
  petName: string;
}) {
  const { personas, listaCompleta } = acceso;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-foreground flex items-center gap-2 font-semibold">
          <Users className="text-brand-600 size-[18px]" />
          Quién tiene acceso
        </h2>

        {listaCompleta ? (
          <Link
            href="/perfil"
            className="text-brand-700 hover:text-brand-800 text-sm font-medium"
          >
            Gestionar accesos
          </Link>
        ) : null}
      </div>

      {personas.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          Solo vos tenés acceso a {petName}.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {personas.map((persona) => (
            <li key={persona.id} className="flex items-center gap-3">
              <Avatar name={persona.nombre} size="sm" />

              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-medium">
                  {persona.nombre}
                  {persona.esVos ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · vos
                    </span>
                  ) : null}
                </p>
                {persona.email ? (
                  <p className="text-muted-foreground truncate text-xs">
                    {persona.email}
                  </p>
                ) : null}
              </div>

              <Badge variant="neutral">{persona.permiso}</Badge>
            </li>
          ))}
        </ul>
      )}

      {/*
        Sin esta aclaración, un codueño leería la lista como completa y
        concluiría que es la única persona con acceso. RLS solo le deja ver su
        propia fila (ver `listPetAccess`), y una lista corta no se distingue de
        una lista corta a la fuerza.
      */}
      {listaCompleta ? null : (
        <p className="text-muted-foreground mt-4 text-xs">
          Compartiste el cuidado de {petName}, pero solo quien la registró puede
          ver la lista completa de accesos.
        </p>
      )}
    </Card>
  );
}
