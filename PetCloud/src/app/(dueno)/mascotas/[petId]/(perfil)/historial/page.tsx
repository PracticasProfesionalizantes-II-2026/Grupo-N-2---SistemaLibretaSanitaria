import type { Metadata } from "next";
import { PenTool, Stethoscope } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getConsultations, getPet } from "@/features/owner/data/pet-queries";
import { formatLongDate } from "@/lib/format";
import { petMetadata } from "@/features/owner/data/pet-metadata";

export async function generateMetadata({
  params,
}: PageProps<"/mascotas/[petId]/historial">): Promise<Metadata> {
  const { petId } = await params;
  return petMetadata(petId, "Historial médico");
}

export default async function PetHistoryPage({
  params,
}: PageProps<"/mascotas/[petId]/historial">) {
  const { petId } = await params;
  const pet = await getPet(petId);
  if (!pet) notFound();

  const consultations = await getConsultations(pet.id);

  if (consultations.length === 0) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="Sin consultas registradas"
        description={`Cuando una veterinaria adherida atienda a ${pet.nombre}, la consulta va a aparecer acá con la firma digital del profesional.`}
      />
    );
  }

  return (
    <ol className="relative space-y-6 pl-6">
      <span
        className="bg-border absolute top-2 bottom-2 left-[7px] w-px"
        aria-hidden
      />

      {consultations.map((consultation) => (
        <li key={consultation.id} className="relative">
          <span
            className="bg-brand-600 ring-background absolute top-1.5 -left-6 size-4 rounded-full ring-4"
            aria-hidden
          />

          <article className="border-border bg-card rounded-xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-foreground font-semibold">
                  {consultation.tipo}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {formatLongDate(consultation.fecha)} ·{" "}
                  {consultation.veterinaria}
                </p>
              </div>
              {consultation.firmaDigital ? (
                <Badge variant="success">
                  <PenTool className="size-3" />
                  Firmado digitalmente
                </Badge>
              ) : null}
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Profesional</dt>
                <dd className="text-foreground mt-0.5">
                  {consultation.veterinario}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Diagnóstico</dt>
                <dd className="text-foreground mt-0.5 font-medium">
                  {consultation.diagnostico}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Observaciones</dt>
                <dd className="text-foreground mt-0.5">
                  {consultation.observaciones}
                </dd>
              </div>
            </dl>
          </article>
        </li>
      ))}
    </ol>
  );
}
