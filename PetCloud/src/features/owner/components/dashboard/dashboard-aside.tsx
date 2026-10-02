import { FileClock } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { VaccinationPlan } from "@/features/owner/components/health/vaccination-plan";
import { getPendingDoses } from "@/features/owner/data/health-queries";
import {
  listMyPets,
  listRecentRecords,
} from "@/features/owner/data/owner-queries";
import { formatDate } from "@/lib/format";

export async function DashboardAside() {
  const [pendingDoses, recentRecords, pets] = await Promise.all([
    getPendingDoses(),
    listRecentRecords(),
    listMyPets(),
  ]);
  const petsSinVacunas = pets
    .filter((pet) => pet.estadoSanitario === "sin-datos")
    .map((pet) => pet.nombre);

  return (
    <div className="space-y-4">
      <VaccinationPlan
        doses={pendingDoses}
        showPetName
        title="Qué falta"
        petsSinVacunas={petsSinVacunas}
        totalPets={pets.length}
      />

      <Card className="p-5">
        <h2 className="text-foreground flex items-center gap-2 font-semibold">
          <FileClock className="text-brand-600 size-[18px]" />
          Últimos registros
        </h2>

        <ul className="mt-4 space-y-3">
          {recentRecords.map((record) => (
            <li key={record.id}>
              <Link
                href={record.href}
                className="hover:bg-muted -mx-2 block rounded-lg px-2 py-2"
              >
                <p className="text-foreground text-sm font-medium">
                  {record.titulo}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {record.detalle} · {formatDate(record.fecha)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
