"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { VET_BASE } from "@/config/vet-nav";
import type { VetVisit } from "@/features/vet/lib/mappers";

/**
 * Cerrar la atención: qué se le hizo a la mascota.
 *
 * Es el registro mínimo que pidió el veterinario. La consulta clínica completa
 * (diagnóstico, tratamiento, firma) sigue viviendo en su propia pantalla; acá
 * queda el resumen que el dueño ve en su historial de visitas.
 */
export function CloseVisitModal({
  visit,
  onClose,
  onConfirm,
}: {
  visit: VetVisit | null;
  onClose: () => void;
  onConfirm: (id: string, resumen: string) => void;
}) {
  const [resumen, setResumen] = useState(visit?.resumen ?? "");

  // Se monta con `key` por visita, así arranca con el resumen que ya tenga.
  if (!visit) return null;

  const petName = visit.petNombre;

  return (
    <Modal
      open
      onClose={onClose}
      title="Cerrar atención"
      description={`${petName} · llegó ${visit.horaLlegada}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm(visit.id, resumen.trim());
              toast.success(
                `Atención de ${petName} cerrada. El dueño la ve en su historial.`,
              );
              onClose();
            }}
            disabled={!resumen.trim()}
          >
            Cerrar atención
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Qué se le hizo"
          htmlFor="resumen-visita"
          hint="Lo lee el dueño. Una o dos líneas alcanzan."
          required
        >
          <Textarea
            id="resumen-visita"
            value={resumen}
            onChange={(event) => setResumen(event.target.value)}
            placeholder="Se aplicó antirrábica y se indicó dieta blanda por 3 días."
          />
        </Field>

        <Alert variant="info">
          Si la atención necesita diagnóstico, tratamiento y firma digital,
          cargala como consulta clínica.
        </Alert>

        <ButtonLink
          href={`${VET_BASE}/pacientes/${visit.petId}/consulta?visita=${visit.id}`}
          variant="outline"
          className="w-full"
        >
          Cargar consulta clínica completa
        </ButtonLink>
      </div>
    </Modal>
  );
}
