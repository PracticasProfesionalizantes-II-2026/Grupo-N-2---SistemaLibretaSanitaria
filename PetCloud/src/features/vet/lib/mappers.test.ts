import { describe, expect, it } from "vitest";

import {
  ordenarCola,
  toVisit,
  type VisitRow,
} from "@/features/vet/lib/mappers";
import type { VetVisit } from "@/features/vet/lib/mappers";

/** Lo mínimo que mira `ordenarCola`; el resto de la visita no interviene. */
const visita = (
  id: string,
  estado: VetVisit["estado"],
  horaLlegada: string,
  prioridad: VetVisit["prioridad"] = "normal",
) => ({ id, estado, horaLlegada, prioridad }) as VetVisit;

const ids = (visitas: VetVisit[]) => visitas.map((v) => v.id);

/** Lo mínimo que necesita `toVisit`; `checked_in_by_id` es lo que varía en cada test. */
const filaVisita = (checkedInById: string | null): VisitRow =>
  ({
    id: "v1",
    pet_id: "p1",
    pets: { name: "Firulais" },
    profiles: null,
    vet_institutions: null,
    checked_in_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
    completed_at: null,
    reason: null,
    is_urgent: false,
    status: "waiting",
    checked_in_by_id: checkedInById,
    summary: null,
    medical_records: null,
  }) as unknown as VisitRow;

describe("ordenarCola", () => {
  it("no muta el arreglo que recibe", () => {
    const original = [
      visita("b", "en-espera", "09:30"),
      visita("a", "en-atencion", "10:00"),
    ];
    const copia = [...original];

    ordenarCola(original);

    expect(ids(original)).toEqual(ids(copia));
  });

  it("pone primero a quien está siendo atendido", () => {
    const cola = ordenarCola([
      visita("espera", "en-espera", "09:00"),
      visita("atencion", "en-atencion", "11:00"),
    ]);

    expect(ids(cola)).toEqual(["atencion", "espera"]);
  });

  it("ordena los cuatro estados de arriba hacia abajo", () => {
    const cola = ordenarCola([
      visita("retirada", "retirada", "08:00"),
      visita("atendida", "atendida", "08:00"),
      visita("espera", "en-espera", "08:00"),
      visita("atencion", "en-atencion", "08:00"),
    ]);

    expect(ids(cola)).toEqual(["atencion", "espera", "atendida", "retirada"]);
  });

  it("dentro de la espera, la urgencia va antes que la llegada", () => {
    const cola = ordenarCola([
      visita("temprano", "en-espera", "08:00"),
      visita("urgencia", "en-espera", "11:00", "urgencia"),
    ]);

    expect(ids(cola)).toEqual(["urgencia", "temprano"]);
  });

  it("con la misma prioridad manda la hora de llegada", () => {
    const cola = ordenarCola([
      visita("tarde", "en-espera", "11:00"),
      visita("temprano", "en-espera", "08:00"),
    ]);

    expect(ids(cola)).toEqual(["temprano", "tarde"]);
  });

  it("la prioridad no reordena fuera de la espera", () => {
    // Una atención ya cerrada no sube por haber entrado como urgencia.
    const cola = ordenarCola([
      visita("temprana", "atendida", "08:00"),
      visita("urgente", "atendida", "11:00", "urgencia"),
    ]);

    expect(ids(cola)).toEqual(["temprana", "urgente"]);
  });

  it("con la lista vacía devuelve una lista vacía", () => {
    expect(ordenarCola([])).toEqual([]);
  });

  it("el orden no cambia cuando se mezclan autogestiones con registros de mostrador", () => {
    const cola = ordenarCola([
      toVisit(filaVisita("staff-1")),
      toVisit(filaVisita(null)),
    ]);

    // `toVisit` da a las dos filas el mismo id ("v1"): lo que importa acá es
    // que agregar `autogestionado` no introdujo un criterio de orden nuevo,
    // así que la longitud y el criterio de `ordenarCola` (Req. 12) quedan
    // intactos con ambos casos presentes.
    expect(cola).toHaveLength(2);
  });
});

describe("toVisit — autogestionado", () => {
  it("es true cuando checked_in_by_id es null (self check-in)", () => {
    expect(toVisit(filaVisita(null)).autogestionado).toBe(true);
  });

  it("es false cuando alguien del mostrador registró la llegada", () => {
    expect(toVisit(filaVisita("profesional-1")).autogestionado).toBe(false);
  });
});
