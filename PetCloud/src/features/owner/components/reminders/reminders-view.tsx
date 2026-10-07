"use client";

import type { ReactNode } from "react";

import {
  Bell,
  BellOff,
  Mail,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ReminderStatusChip } from "@/components/ui/status-chip";
import { ReminderFormModal } from "@/features/owner/components/reminders/reminder-form-modal";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { deleteReminder } from "@/features/owner/actions/reminders-actions";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Reminder, ReminderStatus } from "@/types/schedule";

const REPEAT_LABEL = {
  "una-vez": "Una vez",
  diaria: "Diaria",
  semanal: "Semanal",
  mensual: "Mensual",
  anual: "Anual",
};

const FILTERS: { key: ReminderStatus; label: string }[] = [
  { key: "activo", label: "Activos" },
  { key: "cumplido", label: "Cumplidos" },
  { key: "vencido", label: "Vencidos" },
];

export function RemindersView({
  reminders,
  turnos,
}: {
  reminders: Reminder[];
  /**
   * Los próximos turnos, ya renderizados en el servidor. `ReactNode` y no
   * datos: esta vista es cliente y no puede consultar la base, mismo patrón
   * que `aside` en el dashboard.
   */
  turnos?: ReactNode;
}) {
  const { pets } = useActivePet();
  const router = useRouter();
  const [filter, setFilter] = useState<ReminderStatus>("activo");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function confirmarBorrado() {
    if (!deleting) return;

    setBorrando(true);
    const result = await deleteReminder(deleting.id);
    setBorrando(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Recordatorio eliminado.");
    setDeleting(null);
    router.refresh();
  }

  const petName = (petId: string) =>
    pets.find((pet) => pet.id === petId)?.nombre ?? "Mascota";

  const list = reminders.filter((item) => item.estado === filter);

  return (
    <div>
      <PageHeader
        title="Recordatorios"
        description="Creá recordatorios para lo que tu mascota necesite: vacunas, antiparasitarios, controles o lo que quieras."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nuevo recordatorio
          </Button>
        }
      />

      {/*
        Los turnos van ANTES del filtro y fuera de la lista, y no mezclados
        entre los recordatorios. No es una decisión estética: un turno no es un
        `Reminder` —no tiene repetición, ni canales, ni los mismos estados— y
        forzarlo adentro obligaría a inventarle esos campos. Además el filtro
        de arriba es por estado de recordatorio, y un turno confirmado no es
        "activo", "cumplido" ni "vencido": quedaría escondido detrás de una
        pestaña que no le corresponde.
      */}
      {turnos}

      <div className="border-border bg-card mb-5 inline-flex rounded-lg border p-1">
        {FILTERS.map((option) => {
          const count = reminders.filter((r) => r.estado === option.key).length;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                filter === option.key
                  ? "bg-brand-600 text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label} ({count})
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={`Sin recordatorios ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}`}
          description="Los recordatorios de vacunas y controles se crean solos cuando se carga un registro."
          action={
            filter === "activo" ? (
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Nuevo recordatorio
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((reminder) => (
            <li
              key={reminder.id}
              className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center"
            >
              <span className="bg-brand-50 text-brand-700 flex size-11 shrink-0 items-center justify-center rounded-lg">
                <Bell className="size-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-foreground font-semibold">
                    {reminder.titulo}
                  </h2>
                  <ReminderStatusChip status={reminder.estado} />
                </div>

                <p className="text-muted-foreground mt-1 text-sm">
                  {reminder.descripcion}
                </p>

                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span>{petName(reminder.petId)}</span>
                  <span>
                    {formatLongDate(reminder.fecha)} · {reminder.hora}
                  </span>
                  <span>{REPEAT_LABEL[reminder.repeticion]}</span>
                  <span className="flex items-center gap-1.5">
                    {reminder.canales.includes("push") ? (
                      <Smartphone className="size-3.5" />
                    ) : null}
                    {reminder.canales.includes("email") ? (
                      <Mail className="size-3.5" />
                    ) : null}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(reminder)}
                  className="border-border hover:bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Editar ${reminder.titulo}`}
                >
                  <Pencil className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setDeleting(reminder)}
                  className="border-border hover:bg-muted hover:text-danger text-foreground flex size-9 items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Eliminar ${reminder.titulo}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReminderFormModal open={creating} onClose={() => setCreating(false)} />
      <ReminderFormModal
        key={editing?.id}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        reminder={editing ?? undefined}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title="¿Eliminar el recordatorio?"
        description={
          deleting
            ? `Se va a eliminar "${deleting.titulo}". Esta acción no se puede deshacer.`
            : ""
        }
      />
    </div>
  );
}
