"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { etiquetaMascota } from "@/features/owner/lib/pet-label";
import {
  createReminder,
  updateReminder,
} from "@/features/owner/actions/reminders-actions";
import type { Reminder, ReminderRepeat } from "@/types/schedule";

export function ReminderFormModal({
  open,
  onClose,
  reminder,
}: {
  open: boolean;
  onClose: () => void;
  reminder?: Reminder;
}) {
  const { pets, activePet } = useActivePet();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const isEdit = Boolean(reminder);

  const [titulo, setTitulo] = useState(reminder?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(reminder?.descripcion ?? "");
  const [petId, setPetId] = useState(reminder?.petId ?? activePet?.id ?? "");
  const [fecha, setFecha] = useState(reminder?.fecha ?? "");
  const [hora, setHora] = useState(reminder?.hora ?? "");
  const [repeticion, setRepeticion] = useState<ReminderRepeat>(
    reminder?.repeticion ?? "una-vez",
  );
  const [push, setPush] = useState(reminder?.canales.includes("push") ?? true);
  const [email, setEmail] = useState(
    reminder?.canales.includes("email") ?? false,
  );

  async function handleSave() {
    if (!titulo.trim() || !petId || !fecha || !hora) {
      setError("Completá el título, la mascota, la fecha y la hora.");
      return;
    }

    const canales: ("push" | "email")[] = [];
    if (push) canales.push("push");
    if (email) canales.push("email");

    setSaving(true);
    setError(undefined);

    const input = {
      titulo,
      descripcion: descripcion || undefined,
      fecha,
      hora,
      repeticion,
      canales,
    };

    // `updateReminder` no recibe `petId`: mover un recordatorio a otra mascota
    // arrastraría el historial de avisos ya despachados de la primera. Por eso
    // el selector queda bloqueado en la edición.
    const result = reminder
      ? await updateReminder(reminder.id, input)
      : await createReminder({ ...input, petId });

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    toast.success(
      isEdit ? "Recordatorio actualizado." : "Recordatorio creado.",
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar recordatorio" : "Nuevo recordatorio"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {reminder?.automatico ? (
          <Alert variant="info">
            Este recordatorio lo generó el sistema a partir de un registro
            sanitario. No se puede editar ni eliminar.
          </Alert>
        ) : null}

        {error ? <Alert variant="danger">{error}</Alert> : null}

        <Field label="Título" htmlFor="titulo" required>
          <Input
            id="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </Field>

        <Field label="Descripción" htmlFor="descripcion">
          <Textarea
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Field>

        <Field
          label="Mascota"
          htmlFor="mascota"
          hint={
            isEdit
              ? "Para pasarlo a otra mascota, creá un recordatorio nuevo."
              : undefined
          }
          required
        >
          <Select
            id="mascota"
            value={petId}
            disabled={isEdit}
            onChange={(e) => setPetId(e.target.value)}
          >
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {etiquetaMascota(pet)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha" htmlFor="fecha" required>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
          <Field label="Hora" htmlFor="hora" required>
            <Input
              id="hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Repetición" htmlFor="repeticion" required>
          <Select
            id="repeticion"
            value={repeticion}
            onChange={(e) => setRepeticion(e.target.value as ReminderRepeat)}
          >
            <option value="una-vez">Una vez</option>
            <option value="diaria">Diaria</option>
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </Select>
        </Field>

        <fieldset>
          <legend className="text-foreground mb-2 text-sm font-medium">
            Canal de aviso
          </legend>
          <div className="space-y-2">
            <label className="text-foreground flex items-center gap-2 text-sm">
              <Checkbox
                checked={push}
                onChange={(e) => setPush(e.target.checked)}
                className="mt-0"
              />
              Notificación push
            </label>
            <label className="text-foreground flex items-center gap-2 text-sm">
              <Checkbox
                checked={email}
                onChange={(e) => setEmail(e.target.checked)}
                className="mt-0"
              />
              Email
            </label>
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
