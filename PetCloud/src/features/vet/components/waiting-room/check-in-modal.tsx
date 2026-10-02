"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getPatientForCheckIn,
  searchPatients,
  type PatientSearchResult,
} from "@/features/vet/actions/scan-actions";
import { listPetAppointmentsForDay } from "@/features/vet/actions/waiting-room-actions";
import {
  UnvalidatedInstitutionNotice,
  useInstitutionValidated,
} from "@/features/vet/components/shared/unvalidated-institution-notice";
import type { AppointmentListItem } from "@/features/vet/data/appointments";
import { COMMON_REASONS } from "@/config/vet-catalogs";
import { cn } from "@/lib/utils";
import type { VisitPriority } from "@/types/visit";
import { horaArgentina } from "@/lib/argentina-time";
import { esMotivoUrgencia } from "@/features/vet/lib/motivo-llegada";

/**
 * Registrar llegada.
 *
 * Es el único momento en que el mostrador toca el sistema antes de la atención:
 * identifica a la mascota (por QR o a mano), anota el motivo y la manda a la
 * cola. No hay fecha ni horario porque la hora de llegada es "ahora".
 */
export function CheckInModal({
  open,
  onClose,
  onCheckIn,
  horaActual,
  defaultPatientId,
}: {
  open: boolean;
  onClose: () => void;
  onCheckIn: (data: {
    petId: string;
    motivo: string;
    prioridad: VisitPriority;
    appointmentId?: string;
  }) => void;
  horaActual: string;
  /** Cuando se entra desde la ficha, la mascota ya viene identificada. */
  defaultPatientId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [petId, setPetId] = useState<string | null>(defaultPatientId ?? null);
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  // La prioridad sigue al motivo ("Urgencia" pasa al frente) hasta que alguien
  // la toca a mano; desde ahí manda lo que eligieron y el motivo ya no la mueve.
  const [prioridadManual, setPrioridadManual] = useState<VisitPriority | null>(
    null,
  );
  const prioridad: VisitPriority =
    prioridadManual ?? (esMotivoUrgencia(motivo) ? "urgencia" : "normal");

  // La búsqueda va al servidor: es una consulta a la base, no un filtro sobre
  // una lista que el navegador ya tenga.
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  // 080: sin validar, la búsqueda solo trae pacientes propios.
  const institucionValidada = useInstitutionValidated();

  useEffect(() => {
    let vigente = true;

    const timer = setTimeout(async () => {
      const encontrados =
        query.trim().length < 2 ? [] : await searchPatients(query);

      if (vigente) setResults(encontrados.slice(0, 5));
    }, 250);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [query]);
  /**
   * La mascota que viene de la ficha (`?paciente=`) no está en `results`, que
   * arranca vacío hasta que alguien escribe: se trae aparte. Guarda a qué id
   * pertenece por la misma razón que los turnos de abajo.
   */
  const [precargada, setPrecargada] = useState<PatientSearchResult | null>(
    null,
  );

  useEffect(() => {
    if (!defaultPatientId) return;

    let vigente = true;

    void getPatientForCheckIn(defaultPatientId).then((encontrada) => {
      if (vigente) setPrecargada(encontrada);
    });

    return () => {
      vigente = false;
    };
  }, [defaultPatientId]);

  const selectedResult = petId
    ? (results.find((r) => r.patient.id === petId) ??
      (precargada?.patient.id === petId ? precargada : null))
    : null;
  const selected = selectedResult?.patient ?? null;

  /**
   * Turnos de hoy de la mascota elegida (migración 059).
   *
   * Se busca recién cuando hay mascota, no antes: no hay turnos "del día" sin
   * paciente. En una clínica sin Premium la lista siempre vuelve vacía y el
   * bloque entero no se dibuja — registrar la llegada sigue funcionando igual.
   */
  /**
   * Lo traído y lo elegido guardan **a qué mascota pertenecen**, y lo que la
   * UI usa se deriva de comparar contra la mascota actual. Es más largo que
   * dos `useState` sueltos y evita el error real que traían: al cambiar de
   * mascota había un render con los turnos de la anterior todavía puestos, y
   * limpiarlos desde el efecto es la cascada que `react-hooks` marca. Derivado,
   * ese estado intermedio no existe.
   */
  const [traidos, setTraidos] = useState<{
    petId: string;
    turnos: AppointmentListItem[];
  } | null>(null);
  const [elegido, setElegido] = useState<{
    petId: string;
    id: string | null;
  } | null>(null);

  const turnos = traidos?.petId === petId ? traidos.turnos : [];

  // Un solo turno abierto hoy es, casi siempre, el turno por el que la mascota
  // vino: se preselecciona. Mientras nadie toque el selector, `elegido` es null
  // y manda esa preselección; en cuanto lo tocan, manda lo que eligieron.
  const appointmentId =
    elegido?.petId === petId
      ? elegido.id
      : turnos.length === 1
        ? turnos[0].id
        : null;

  useEffect(() => {
    if (!petId) return;

    let vigente = true;

    void listPetAppointmentsForDay(petId).then((encontrados) => {
      if (vigente) setTraidos({ petId, turnos: encontrados });
    });

    return () => {
      vigente = false;
    };
  }, [petId]);

  function reset() {
    setQuery("");
    setPetId(defaultPatientId ?? null);
    setMotivo("");
    setDetalle("");
    setPrioridadManual(null);
    setTraidos(null);
    setElegido(null);
  }

  function handleSubmit() {
    if (!petId || !motivo) return;

    onCheckIn({
      petId,
      motivo: detalle.trim() ? `${motivo} — ${detalle.trim()}` : motivo,
      prioridad,
      appointmentId: appointmentId ?? undefined,
    });
    toast.success(`Llegada registrada a las ${horaActual}.`);
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar llegada"
      description={`Entra a la cola con hora de llegada ${horaActual}.`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!petId || !motivo}>
            Agregar a la cola
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Paciente"
          htmlFor="checkin-buscar"
          hint="Escaneá el QR del collar o buscá por mascota, dueño o DNI."
          required
        >
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              id="checkin-buscar"
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
                Pacientes y volver a registrar la llegada.
              </Alert>
            ) : (
              <UnvalidatedInstitutionNotice />
            )
          ) : (
            <ul className="border-border divide-border divide-y rounded-lg border">
              {results.map(({ patient, owner }) => {
                return (
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
                          {[
                            patient.raza,
                            owner?.nombre && `Dueño: ${owner.nombre}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="text-muted-foreground/70 block truncate font-mono text-[11px]">
                          {patient.qrCode}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
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
                {[
                  selected.raza,
                  selectedResult?.owner?.nombre &&
                    `Dueño: ${selectedResult.owner.nombre}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-muted-foreground/70 font-mono text-[11px]">
                {selected.qrCode}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPetId(null)}>
              Cambiar
            </Button>
          </div>
        ) : null}

        {turnos.length > 0 ? (
          <Field
            label="Turno de hoy"
            htmlFor="checkin-turno"
            hint="Si la llegada corresponde a un turno agendado, al cerrar la visita el turno queda marcado como atendido."
          >
            <Select
              id="checkin-turno"
              value={appointmentId ?? ""}
              onChange={(event) => {
                if (!petId) return;
                setElegido({ petId, id: event.target.value || null });
              }}
            >
              <option value="">Sin turno (vino sin agendar)</option>
              {turnos.map((turno) => (
                <option key={turno.id} value={turno.id}>
                  {horaArgentina(turno.startsAt)}
                  {" · "}
                  {turno.motivo}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Motivo" htmlFor="checkin-motivo" required>
          <Select
            id="checkin-motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
          >
            <option value="" disabled>
              Elegí un motivo
            </option>
            {COMMON_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Detalle"
          htmlFor="checkin-detalle"
          hint="Opcional. Lo que cuenta el dueño en el mostrador."
        >
          <Textarea
            id="checkin-detalle"
            value={detalle}
            onChange={(event) => setDetalle(event.target.value)}
            placeholder="Vomita desde ayer, cojea de la pata trasera…"
            className="min-h-20"
          />
        </Field>

        <div>
          <p className="text-foreground mb-2 text-sm font-medium">Prioridad</p>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                {
                  value: "normal",
                  label: "Normal",
                  detail: "Respeta el orden de llegada",
                },
                {
                  value: "urgencia",
                  label: "Urgencia",
                  detail: "Pasa al frente de la cola",
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPrioridadManual(option.value)}
                aria-pressed={prioridad === option.value}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  prioridad === option.value
                    ? option.value === "urgencia"
                      ? "border-danger bg-danger-soft"
                      : "border-brand-600 bg-brand-50"
                    : "border-border hover:border-brand-300",
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    prioridad === option.value && option.value === "urgencia"
                      ? "text-danger"
                      : "text-foreground",
                  )}
                >
                  {option.label}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {option.detail}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
