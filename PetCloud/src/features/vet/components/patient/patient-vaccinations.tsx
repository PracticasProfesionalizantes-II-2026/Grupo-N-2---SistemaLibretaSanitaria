"use client";

import { Syringe } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { UnverifiedChip } from "@/components/ui/status-chip";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { VET_BASE } from "@/config/vet-nav";
import { RecordCard } from "@/features/owner/components/pet-profile/record-card";
import { verifyVaccineAction } from "@/features/vet/actions/vaccination-actions";
import { formatDate } from "@/lib/format";
import type { Vaccination, VaccineStatus } from "@/types/pet";

const STATUS: Record<
  VaccineStatus,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  aplicada: { label: "Aplicada", variant: "success" },
  proxima: { label: "Próxima a vencer", variant: "warning" },
  vencida: { label: "Vencida", variant: "danger" },
};

function puedeVerificar(vaccination: Vaccination) {
  return (
    vaccination.revision === "pendiente" ||
    (vaccination.origen === "dueno" && !vaccination.revision)
  );
}

export function PatientVaccinations({
  vaccinations,
  petId,
}: {
  vaccinations: Vaccination[];
  petId: string;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Se puede verificar desde acá una dosis autodeclarada de campaña
  // ("pendiente") y, desde la 076, también una carga de memoria del dueño sin
  // campaña (`origen === "dueno"` y `revision` vacío). Una declaración
  // rechazada no: esa ya tuvo su revisión. Qué transición es legal lo decide
  // el trigger `protect_vaccination_verification()`, no este botón.
  function verificar(vaccination: Vaccination) {
    setError(null);
    setPendingId(vaccination.id);
    startTransition(async () => {
      try {
        const result = await verifyVaccineAction(vaccination.id, petId);
        if (!result.success) setError(result.error);
      } catch {
        setError("No se pudo verificar la vacuna. Intentá de nuevo.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function verifyButton(vaccination: Vaccination) {
    const busy = isPending && pendingId === vaccination.id;
    return (
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={busy}
        onClick={() => verificar(vaccination)}
      >
        {busy ? "Verificando..." : "Verificar"}
      </Button>
    );
  }

  if (vaccinations.length === 0) {
    return (
      <EmptyState
        icon={Syringe}
        title="Sin vacunas registradas"
        description="Cargá la primera dosis para empezar el plan sanitario del paciente."
        action={
          <ButtonLink href={`${VET_BASE}/pacientes/${petId}/vacunacion`}>
            Cargar vacunación
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ButtonLink
          href={`${VET_BASE}/pacientes/${petId}/vacunacion`}
          size="sm"
        >
          <Syringe className="size-4" />
          Cargar vacunación
        </ButtonLink>
      </div>

      {error ? (
        <p className="text-danger mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <TH>Vacuna</TH>
              <TH>Dosis</TH>
              <TH>Aplicación</TH>
              <TH>Próxima</TH>
              <TH>Lugar</TH>
              <TH>Estado</TH>
              <TH>Verificación</TH>
            </tr>
          </THead>
          <TBody>
            {vaccinations.map((vaccination) => (
              <TR key={vaccination.id}>
                <TD className="font-medium">
                  <div className="flex items-center gap-2">
                    {vaccination.vacuna}
                    {vaccination.origen === "dueno" ? <UnverifiedChip /> : null}
                  </div>
                </TD>
                <TD className="text-muted-foreground">{vaccination.dosis}</TD>
                <TD>{formatDate(vaccination.fechaAplicacion)}</TD>
                <TD>
                  {vaccination.proximaDosis
                    ? formatDate(vaccination.proximaDosis)
                    : "—"}
                </TD>
                <TD className="text-muted-foreground">{vaccination.lugar}</TD>
                <TD>
                  <Badge variant={STATUS[vaccination.estado].variant}>
                    {STATUS[vaccination.estado].label}
                  </Badge>
                </TD>
                <TD>
                  {puedeVerificar(vaccination) ? (
                    verifyButton(vaccination)
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {vaccinations.map((vaccination) => (
          <RecordCard
            key={vaccination.id}
            title={vaccination.vacuna}
            badges={vaccination.origen === "dueno" ? <UnverifiedChip /> : null}
            status={
              <Badge variant={STATUS[vaccination.estado].variant}>
                {STATUS[vaccination.estado].label}
              </Badge>
            }
            dates={[
              {
                label: "Aplicación",
                value: formatDate(vaccination.fechaAplicacion),
              },
              {
                label: "Próxima dosis",
                value: vaccination.proximaDosis
                  ? formatDate(vaccination.proximaDosis)
                  : "—",
              },
            ]}
            secondary={
              <>
                <p>Lugar: {vaccination.lugar}</p>
                <p>Dosis: {vaccination.dosis}</p>
              </>
            }
            actions={
              puedeVerificar(vaccination) ? (
                <div className="flex w-full justify-end">
                  {verifyButton(vaccination)}
                </div>
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
