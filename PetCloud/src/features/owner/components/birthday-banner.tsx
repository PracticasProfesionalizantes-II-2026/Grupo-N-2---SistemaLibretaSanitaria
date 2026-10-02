"use client";

import { Cake, PartyPopper } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  mascotasQueCumplenHoy,
  tituloDeCumpleanos,
} from "@/features/owner/lib/birthdays";
import type { Pet } from "@/types/pet";

/**
 * Festive banner shown only on the days at least one pet has its birthday.
 *
 * "Today" is resolved in Argentina's time zone (see `mascotasQueCumplenHoy`),
 * so the server render and the browser agree and there is no hydration
 * mismatch around midnight UTC.
 */
export function BirthdayBanner({ pets }: { pets: Pet[] }) {
  const cumpleaneros = mascotasQueCumplenHoy(pets);
  if (cumpleaneros.length === 0) return null;

  const titulo = tituloDeCumpleanos(cumpleaneros.map((pet) => pet.nombre));

  return (
    <Card
      role="status"
      className="mb-6 flex items-center gap-4 border-amber-300 bg-gradient-to-r from-amber-50 via-pink-50 to-sky-50 p-5 dark:border-amber-500/40 dark:from-amber-500/10 dark:via-pink-500/10 dark:to-sky-500/10"
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
        <Cake className="size-6" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-base font-semibold">{titulo}</p>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Un buen día para un mimo extra.
        </p>
      </div>
      <PartyPopper
        className="hidden size-8 shrink-0 text-pink-500 sm:block"
        aria-hidden
      />
    </Card>
  );
}
