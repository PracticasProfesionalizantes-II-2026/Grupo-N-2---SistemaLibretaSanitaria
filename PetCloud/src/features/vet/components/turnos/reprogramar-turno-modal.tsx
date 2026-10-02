"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { AppointmentListItem } from "@/features/vet/data/appointments";
import {
  argentinaAUtcIso,
  horaArgentina,
  hoyArgentina,
} from "@/lib/argentina-time";

export type ReprogramarData = {
  startsAt: string;
  duracionMin?: number;
};

/** Divide un ISO en fecha (`YYYY-MM-DD`) y hora (`HH:mm`) de Argentina, para precargar los dos inputs nativos. */
function partesLocales(iso: string) {
  return { fecha: hoyArgentina(iso), hora: horaArgentina(iso) };
}

/**
 * Reprogramar: lo único que cambia es cuándo (y, si hace falta, cuánto dura)
 * — mismo criterio que `appointmentRescheduleSchema`, que separa esta acción
 * de crear un turno nuevo.
 */
export function ReprogramarTurnoModal({
  turno,
  onClose,
  onConfirmar,
}: {
  turno: AppointmentListItem | null;
  onClose: () => void;
  onConfirmar: (data: ReprogramarData) => Promise<boolean>;
}) {
  const partes = turno
    ? partesLocales(turno.startsAt)
    : { fecha: "", hora: "" };
  const [fecha, setFecha] = useState(partes.fecha);
  const [hora, setHora] = useState(partes.hora);
  const [duracionMin, setDuracionMin] = useState(turno?.duracionMin ?? 30);
  const [enviando, setEnviando] = useState(false);

  // Se remonta con `key={turno?.id}` desde quien lo usa, así arranca siempre
  // con la fecha/hora/duración del turno elegido.
  if (!turno) return null;

  async function handleSubmit() {
    if (!fecha || !hora) return;

    setEnviando(true);
    const ok = await onConfirmar({
      startsAt: argentinaAUtcIso(fecha, hora),
      duracionMin,
    });
    setEnviando(false);

    if (ok) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reprogramar turno"
      description={`${turno.pacienteNombre} · ${turno.motivo}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!fecha || !hora || enviando}>
            {enviando ? "Guardando..." : "Confirmar nueva fecha"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha" htmlFor="reprogramar-fecha" required>
            <Input
              id="reprogramar-fecha"
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
            />
          </Field>
          <Field label="Horario" htmlFor="reprogramar-hora" required>
            <Input
              id="reprogramar-hora"
              type="time"
              value={hora}
              onChange={(event) => setHora(event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Duración (minutos)"
          htmlFor="reprogramar-duracion"
          hint="Entre 5 y 480 minutos."
        >
          <Input
            id="reprogramar-duracion"
            type="number"
            min={5}
            max={480}
            value={duracionMin}
            onChange={(event) =>
              setDuracionMin(Number(event.target.value) || 0)
            }
          />
        </Field>
      </div>
    </Modal>
  );
}
