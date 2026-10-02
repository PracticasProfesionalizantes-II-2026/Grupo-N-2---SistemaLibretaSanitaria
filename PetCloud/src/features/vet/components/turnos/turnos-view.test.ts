import { describe, expect, it } from "vitest";

import { agruparPorFecha } from "@/features/vet/components/turnos/turnos-view";
import type { AppointmentListItem } from "@/features/vet/data/appointments";

/**
 * `agruparPorFecha()` es la única lógica propia de `TurnosView` que vale la
 * pena aislar: el resto es composición de componentes ya probados
 * indirectamente (acciones/datos, fase 8) o marcado visual. El proyecto no
 * tiene `@testing-library/react` ni un entorno jsdom configurado en
 * `vitest.config.mts` (`environment: "node"`, `include` solo levanta
 * `*.test.ts`) — instalar esa infraestructura por primera vez para esta sola
 * pantalla queda fuera del alcance de esta unidad; el propio plan de tasks
 * de la fase 9 marca "manual click-through" como la verificación de esta UI,
 * no un test de render automatizado.
 */

function turno(
  overrides: Partial<AppointmentListItem> & { startsAt: string },
): AppointmentListItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    startsAt: overrides.startsAt,
    duracionMin: overrides.duracionMin ?? 30,
    motivo: overrides.motivo ?? "Control",
    estado: overrides.estado ?? "scheduled",
    petId: overrides.petId ?? "pet-1",
    pacienteNombre: overrides.pacienteNombre ?? "Firulais",
    profesionalId: overrides.profesionalId ?? "prof-1",
    profesionalNombre: overrides.profesionalNombre ?? "Dra. Gómez",
  };
}

describe("agruparPorFecha", () => {
  it("agrupa turnos del mismo día calendario local bajo una sola clave", () => {
    const agenda = [
      turno({ id: "a", startsAt: "2026-09-10T09:00:00-03:00" }),
      turno({ id: "b", startsAt: "2026-09-10T15:30:00-03:00" }),
    ];

    const grupos = agruparPorFecha(agenda);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].fecha).toBe("2026-09-10");
    expect(grupos[0].turnos.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("separa turnos de días distintos, incluso cercanos a medianoche", () => {
    const agenda = [
      turno({ id: "tarde", startsAt: "2026-09-10T23:30:00-03:00" }),
      turno({ id: "madrugada", startsAt: "2026-09-11T00:15:00-03:00" }),
    ];

    const grupos = agruparPorFecha(agenda);

    expect(grupos.map((g) => g.fecha)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(grupos[0].turnos.map((t) => t.id)).toEqual(["tarde"]);
    expect(grupos[1].turnos.map((t) => t.id)).toEqual(["madrugada"]);
  });

  it("ordena los grupos por fecha ascendente sin importar el orden de entrada", () => {
    const agenda = [
      turno({ id: "despues", startsAt: "2026-09-15T10:00:00-03:00" }),
      turno({ id: "antes", startsAt: "2026-09-05T10:00:00-03:00" }),
    ];

    const grupos = agruparPorFecha(agenda);

    expect(grupos.map((g) => g.fecha)).toEqual(["2026-09-05", "2026-09-15"]);
  });

  it("con agenda vacía devuelve una lista vacía de grupos", () => {
    expect(agruparPorFecha([])).toEqual([]);
  });
});
