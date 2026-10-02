"use client";

import { House } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSessionUser } from "@/features/auth/components/session-provider";

/**
 * Reminder shown on the dashboard while the owner has no home address saved.
 *
 * The address is what lets people who live with the owner find them and ask to
 * be linked to their pets, so an empty one silently disables that flow. The
 * session user already carries it (`current-user.ts` maps `profiles.address`
 * to `direccion`, with `""` when missing), so no extra query is needed.
 */
export function CompleteAddressBanner() {
  const user = useSessionUser();
  if (!user || user.direccion.trim() !== "") return null;

  return (
    <Card
      role="status"
      className="mb-6 flex flex-col gap-4 border-sky-300 bg-sky-50 p-5 sm:flex-row sm:items-center dark:border-sky-500/40 dark:bg-sky-500/10"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300">
        <House className="size-5" aria-hidden />
      </div>
      <p className="text-foreground min-w-0 flex-1 text-sm">
        Completá tu dirección de hogar en tu perfil para que familiares o
        personas con las que convivís puedan solicitar vincularse a tus
        mascotas.
      </p>
      <ButtonLink href="/perfil#direccion" size="sm" className="shrink-0">
        Completar dirección
      </ButtonLink>
    </Card>
  );
}
