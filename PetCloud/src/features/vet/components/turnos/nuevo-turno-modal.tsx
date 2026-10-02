"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { searchPatients } from "@/features/vet/actions/scan-actions";
import {
  UnvalidatedInstitutionNotice,
  useInstitutionValidated,
} from "@/features/vet/components/shared/unvalidated-institution-notice";
import type { Patient, Professional } from "@/types/vet";
import { argentinaAUtcIso } from "@/lib/argentina-time";

export type NuevoTurnoData = {
  petId: string;
  profesionalId: string;
  /** ISO completo (con offset), listo para `appointments.starts_at`. */
  startsAt: string;
  duracionMin: number;
  motivo: string;
  notasInternas?: string;
};

/**
 * Agendar un turno nuevo.
 *
 * La búsqueda de paciente reutiliza el mismo patrón que `CheckInModal`
 * (sala de espera, fase previa): identificar la mascota es el mismo problema
 * en los dos casos, solo cambia qué pasa después de encontrarla. La fecha y
 * el horario se piden por separado (dos inputs nativos) y se combinan recién
 * al enviar en un único `startsAt` — la tabla guarda un solo TIMESTAMPTZ
 * (diseño D9), no dos columnas.
 */
export function NuevoTurnoModal({
  open,
  onClose,
  onCrear,
  equipo,
  profesionalPorDefecto,
}: {
  open: boolean;
  onClose: () => void;
  /** `true` si se guardó: el modal se cierra y limpia. */
  onCrear: (data: NuevoTurnoData) => Promise<boolean>;
  equipo: Professional[];
  profesionalPorDefecto?: string;
}) {
  const [query, setQuery] = useState("");
  const [petId, setPetId] = useState<string | null>(null);
  const [results, setResults] = useState<Patient[]>([]);
  // 080: sin validar, la búsqueda solo trae pacientes propios.
  const institucionValidada = useInstitutionValidated();
  const [profesionalId, setProfesionalId] = useState(
    profesionalPorDefecto ?? "",
  );
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [duracionMin, setDuracionMin] = useState(30);
  const [motivo, setMotivo] = useState("");
  const [notasInternas, setNotasInternas] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;

    const timer = setTimeout(async () => {
      const encontrados =
        query.trim().length < 2 ? [] : await searchPatients(query);
      // searchPatients ahora devuelve paciente + dueño; este modal solo
      // necesita el paciente.
      if (vigente)
        setResults(
          encontrados.slice(0, 5).map((resultado) => resultado.patient),
        );
    }, 250);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [query]);

  const selected = petId
    ? (results.find((patient) => patient.id === petId) ?? null)
    : null;

  function reset() {
    setQuery("");
    setPetId(null);
    setResults([]);
    setProfesionalId(profesionalPorDefecto ?? "");
    setFecha("");
    setHora("");
    setDuracionMin(30);
    setMotivo("");
    setNotasInternas("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  const listo = Boolean(
    petId && profesionalId && fecha && hora && motivo.trim(),
  );

  async function handleSubmit() {
    if (!listo || !petId) return;

    setEnviando(true);
    const ok = await onCrear({
      petId,
      profesionalId,
      startsAt: argentinaAUtcIso(fecha, hora),
      duracionMin,
      motivo: motivo.trim(),
      notasInternas: notasInternas.trim() || undefined,
    });
    setEnviando(false);

    if (ok) handleClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Agendar turno"
      description="El dueño de la mascota recibe una notificación en cuanto se guarda."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!listo || enviando}>
            {enviando ? "Agendando..." : "Agendar turno"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Paciente"
          htmlFor="turno-buscar"
          hint="Buscá por mascota, dueño o nº de registro."
          required
        >
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              id="turno-buscar"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPetId(null);
              }}
              placeholder="Firulais, Sofía Ramírez, PC-8F3A-2K9D…"
              className="pl-9"
            />
          </div>
        </Field>

        {query.trim().length >= 2 && !selected ? (
          results.length === 0 ? (
            institucionValidada ? (
              <Alert variant="warning">
                No encontramos a esa mascota. Podés darla de alta desde
                Pacientes y volver a agendar el turno.
              </Alert>
            ) : (
              <UnvalidatedInstitutionNotice />
            )
          ) : (
            <ul className="border-border divide-border divide-y rounded-lg border">
              {results.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => setPetId(patient.id)}
                    className="hover:bg-muted flex w-full items-center gap-3 p-3 text-left"
                  >
                    <Avatar name={patient.nombre} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm font-medium">
                        {patient.nombre}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {patient.raza} · {patient.qrCode}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {selected ? (
          <div className="border-brand-500 bg-brand-50 flex items-center gap-3 rounded-lg border p-3">
            <Avatar name={selected.nombre} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-medium">
                {selected.nombre}
              </p>
              <p className="text-muted-foreground text-xs">
                {selected.raza} · {selected.qrCode}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPetId(null)}>
              Cambiar
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha" htmlFor="turno-fecha" required>
            <Input
              id="turno-fecha"
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
            />
          </Field>
          <Field label="Horario" htmlFor="turno-hora" required>
            <Input
              id="turno-hora"
              type="time"
              value={hora}
              onChange={(event) => setHora(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Profesional" htmlFor="turno-profesional" required>
            <Select
              id="turno-profesional"
              value={profesionalId}
              onChange={(event) => setProfesionalId(event.target.value)}
            >
              <option value="" disabled>
                Elegí un profesional
              </option>
              {equipo.map((profesional) => (
                <option key={profesional.id} value={profesional.id}>
                  {profesional.nombre}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Duración (minutos)"
            htmlFor="turno-duracion"
            hint="Entre 5 y 480 minutos."
            required
          >
            <Input
              id="turno-duracion"
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

        <Field label="Motivo" htmlFor="turno-motivo" required>
          <Input
            id="turno-motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Control anual, vacunación, cirugía…"
          />
        </Field>

        <Field
          label="Notas internas"
          htmlFor="turno-notas"
          hint="Opcional. No lo ve el dueño."
        >
          <Textarea
            id="turno-notas"
            value={notasInternas}
            onChange={(event) => setNotasInternas(event.target.value)}
            placeholder="Repasar análisis previos, viene con radiografía…"
          />
        </Field>
      </div>
    </Modal>
  );
}
