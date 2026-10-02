"use client";

import { Pill, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { TreatmentModal } from "@/features/vet/components/patient/treatment-modal";
import { formatDate } from "@/lib/format";
import type { Medication } from "@/types/pet";

export function PatientTreatments({
  medications,
  patientName,
}: {
  medications: Medication[];
  patientName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {medications.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="Sin tratamientos activos"
          description={`${patientName} no tiene medicación indicada en PetCloud.`}
          action={
            <Button onClick={() => setOpen(true)}>Cargar tratamiento</Button>
          }
        />
      ) : (
        <div>
          <div className="mb-4 flex justify-end">
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              Cargar tratamiento
            </Button>
          </div>

          <div className="space-y-4">
            {medications.map((medication) => {
              const activo = !medication.hasta;

              return (
                <Card key={medication.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-foreground font-semibold">
                        {medication.medicamento}
                      </h3>
                      <p className="text-muted-foreground mt-0.5 text-sm">
                        {medication.dosis} · {medication.frecuencia}
                      </p>
                    </div>
                    <Badge variant={activo ? "success" : "neutral"}>
                      {activo ? "En curso" : "Finalizado"}
                    </Badge>
                  </div>

                  <p className="text-foreground mt-3 text-sm">
                    {medication.indicaciones}
                  </p>

                  <p className="text-muted-foreground mt-3 text-xs">
                    Desde {formatDate(medication.desde)}
                    {medication.hasta
                      ? ` hasta ${formatDate(medication.hasta)}`
                      : " · sin fecha de fin"}
                  </p>

                  {medication.notasDueno ? (
                    <div className="border-border bg-muted mt-4 rounded-lg border p-3">
                      <p className="text-muted-foreground text-xs font-semibold uppercase">
                        Nota del dueño
                      </p>
                      <p className="text-foreground mt-1 text-sm">
                        {medication.notasDueno}
                      </p>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <TreatmentModal
        open={open}
        onClose={() => setOpen(false)}
        patientName={patientName}
      />
    </>
  );
}
