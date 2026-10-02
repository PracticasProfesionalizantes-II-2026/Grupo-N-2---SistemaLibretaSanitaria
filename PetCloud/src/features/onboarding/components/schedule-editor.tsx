"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DAY_LABELS,
  DAYS_OF_WEEK,
  type DayOfWeek,
  type FullSchedule,
  type Schedule,
} from "@/features/vet/schemas/schedule-schemas";

// Las claves son las de `vet_institutions.schedule` (068), no abreviaturas
// propias: así lo que edita la pantalla es exactamente lo que se guarda.
const DAYS = DAYS_OF_WEEK.map((key) => ({ key, label: DAY_LABELS[key] }));

/**
 * En pantalla cada día guarda sus horas aunque esté cerrado, para que
 * destildar y volver a tildar no las pierda. Lo que se guarda en la base no:
 * un día cerrado es `{ open: false }` y nada más (ver `toSchedule`).
 */
type DaySchedule = { open: boolean; from: string; to: string };
type EditorState = Record<DayOfWeek, DaySchedule>;

const DEFAULT_SCHEDULE = Object.fromEntries(
  DAYS.map((day) => [
    day.key,
    {
      open: !["saturday", "sunday"].includes(day.key),
      from: "09:00",
      to: "18:00",
    },
  ]),
) as EditorState;

function fromSchedule(schedule: Schedule | undefined): EditorState {
  // `{}` = todavía no cargó horarios: arranca con la semana típica.
  if (!schedule || !("monday" in schedule)) return DEFAULT_SCHEDULE;

  const full = schedule as FullSchedule;
  return Object.fromEntries(
    DAYS.map(({ key }) => {
      const day = full[key];
      return [key, day.open ? day : { ...DEFAULT_SCHEDULE[key], open: false }];
    }),
  ) as EditorState;
}

/** La forma que acepta la base: los siete días, los cerrados sin horas. */
function toSchedule(state: EditorState): FullSchedule {
  return Object.fromEntries(
    DAYS.map(({ key }) => {
      const day = state[key];
      return [
        key,
        day.open ? { open: true, from: day.from, to: day.to } : { open: false },
      ];
    }),
  ) as FullSchedule;
}

/** La semana con la que arranca el editor, en la forma que se guarda. */
export function defaultSchedule(): FullSchedule {
  return toSchedule(DEFAULT_SCHEDULE);
}

export function ScheduleEditor({
  initialSchedule,
  onChange,
  disabled = false,
}: {
  initialSchedule?: Schedule;
  /** Recibe cada cambio ya en la forma que se guarda. */
  onChange?: (schedule: FullSchedule) => void;
  disabled?: boolean;
} = {}) {
  const [schedule, setSchedule] = useState(() => fromSchedule(initialSchedule));

  function update(key: DayOfWeek, patch: Partial<DaySchedule>) {
    const next = { ...schedule, [key]: { ...schedule[key], ...patch } };
    setSchedule(next);
    onChange?.(toSchedule(next));
  }

  return (
    <div className="divide-border border-border divide-y rounded-lg border">
      {DAYS.map((day) => {
        const value = schedule[day.key];

        return (
          <div key={day.key} className="flex items-center gap-3 p-3">
            <label className="text-foreground flex w-32 shrink-0 items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={value.open}
                disabled={disabled}
                onChange={(e) => update(day.key, { open: e.target.checked })}
                className="mt-0"
              />
              {day.label}
            </label>

            {value.open ? (
              <div className="flex flex-1 items-center gap-2">
                <Input
                  type="time"
                  value={value.from}
                  disabled={disabled}
                  onChange={(e) => update(day.key, { from: e.target.value })}
                  className="h-9"
                  aria-label={`${day.label}: hora de apertura`}
                />
                <span className="text-muted-foreground text-sm">a</span>
                <Input
                  type="time"
                  value={value.to}
                  disabled={disabled}
                  onChange={(e) => update(day.key, { to: e.target.value })}
                  className="h-9"
                  aria-label={`${day.label}: hora de cierre`}
                />
              </div>
            ) : (
              <p className="text-muted-foreground flex-1 text-sm">Cerrado</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
