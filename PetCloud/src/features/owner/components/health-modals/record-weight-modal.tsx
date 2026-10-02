"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import {
  addWeightRecord,
  updateWeightRecord,
} from "@/features/owner/actions/health-records-actions";
import {
  hoyISO,
  pesajeDelMismoDia,
  validarFechaDePeso,
} from "@/features/owner/schemas/weight-record-schema";
import type { WeightEntry } from "@/types/pet";
import { hoyArgentina } from "@/lib/argentina-time";

export function RecordWeightModal({
  open,
  onClose,
  petId,
  petName,
  fechaNacimiento,
  entry,
  pesajes = [],
}: {
  open: boolean;
  onClose: () => void;
  petId: string;
  petName: string;
  /**
   * Piso para la fecha del pesaje. Vacío o ausente cuando la mascota no tiene
   * nacimiento cargado (`pets.date_of_birth` es NULLABLE): ahí no hay piso que
   * exigir, y `mappers.ts` proyecta ese NULL como string vacío.
   */
  fechaNacimiento?: string;
  entry?: WeightEntry;
  /**
   * Pesajes ya cargados de la mascota. Solo el alta los usa: si ya hay uno ese
   * mismo día, pregunta si reemplazarlo o agregar otro en vez de duplicarlo
   * sin avisar. Dos del mismo día pueden ser legítimos (balanza de casa y de
   * la veterinaria), por eso se pregunta y no se bloquea.
   */
  pesajes?: WeightEntry[];
}) {
  const isEdit = Boolean(entry);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const [peso, setPeso] = useState(entry ? String(entry.pesoKg) : "");
  const [fecha, setFecha] = useState(() => entry?.fecha ?? hoyArgentina());
  const [nota, setNota] = useState(entry?.nota ?? "");
  const [mismoDia, setMismoDia] = useState<WeightEntry>();

  // Se calcula una vez por montaje: el modal no vive abierto cruzando la
  // medianoche, y recalcularlo en cada render movería el `max` del input.
  const [hoy] = useState(hoyISO);
  const piso = fechaNacimiento || undefined;

  async function handleSave(decision?: "reemplazar" | "agregar") {
    const valor = Number(peso.replace(",", "."));

    if (!valor || valor <= 0) {
      setError("Ingresá un peso mayor a 0.");
      return;
    }

    // El `min`/`max` del input es una sugerencia: el navegador los respeta al
    // usar el selector, pero una fecha tipeada a mano los atraviesa. La defensa
    // real está en las actions y en la base (migración 052); esto es para que
    // el error se lea acá y no como un fallo genérico del servidor.
    const errorFecha = validarFechaDePeso(fecha, piso, hoy);

    if (errorFecha) {
      setError(errorFecha);
      return;
    }

    const existente = entry ? undefined : pesajeDelMismoDia(pesajes, fecha);
    if (existente && !decision) {
      setError(undefined);
      setMismoDia(existente);
      return;
    }

    setSaving(true);
    setError(undefined);
    setMismoDia(undefined);

    const input = { pesoKg: valor, fecha, nota };

    // "Reemplazar" edita el pesaje existente (misma acción que "Editar", que
    // RLS y el filtro `source = 'owner'` ya limitan a los del dueño).
    const aReemplazar =
      decision === "reemplazar" && existente?.origen === "dueno"
        ? existente
        : undefined;
    const destino = entry ?? aReemplazar;

    const result = destino
      ? await updateWeightRecord(destino.id, petId, input)
      : await addWeightRecord(petId, input);

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    toast.success(
      isEdit || aReemplazar
        ? "Se actualizó el peso."
        : `Peso registrado para ${petName}.`,
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar peso" : "Registrar peso"}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => handleSave()} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Peso (kg)" htmlFor="peso" error={error} required>
          <Input
            id="peso"
            type="number"
            step="0.1"
            min="0"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
        </Field>

        <Field label="Fecha" htmlFor="fecha" required>
          <Input
            id="fecha"
            type="date"
            value={fecha}
            max={hoy}
            min={piso}
            onChange={(e) => {
              setFecha(e.target.value);
              setMismoDia(undefined);
            }}
          />
        </Field>

        {mismoDia ? (
          <Alert variant="warning">
            <div className="space-y-3">
              <p>
                {fecha === hoy
                  ? "Ya hay un pesaje de hoy"
                  : "Ya hay un pesaje de ese día"}{" "}
                ({mismoDia.pesoKg} kg).{" "}
                {mismoDia.origen === "dueno"
                  ? "¿Reemplazarlo o agregar otro?"
                  : "Lo cargó un veterinario, así que no se puede reemplazar. ¿Agregar otro igual?"}
              </p>
              <div className="flex flex-wrap gap-2">
                {mismoDia.origen === "dueno" ? (
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => handleSave("reemplazar")}
                  >
                    Reemplazar
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => handleSave("agregar")}
                >
                  Agregar otro
                </Button>
              </div>
            </div>
          </Alert>
        ) : null}

        <Field label="Nota" htmlFor="nota" hint="Opcional">
          <Textarea
            id="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Observaciones sobre este control..."
          />
        </Field>
      </div>
    </Modal>
  );
}
