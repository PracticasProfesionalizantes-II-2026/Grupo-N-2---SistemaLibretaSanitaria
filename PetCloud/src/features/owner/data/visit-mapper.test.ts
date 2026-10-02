import { describe, expect, it } from "vitest";

import { toVisit, type VisitRow } from "@/features/owner/data/visit-mapper";

/** Fila mínima válida, para no repetir todas las columnas en cada test. */
function fila(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    id: "v1",
    pet_id: "pet1",
    institution_id: "inst1",
    owner_id: "owner1",
    checked_in_at: "2026-08-11T14:05:00.000Z",
    checked_in_by_id: null,
    status: "waiting",
    is_urgent: false,
    reason: null,
    medical_record_id: null,
    appointment_id: null,
    completed_at: null,
    summary: null,
    created_at: "2026-08-11T14:05:00.000Z",
    updated_at: "2026-08-11T14:05:00.000Z",
    vet_institutions: null,
    medical_records: null,
    ...overrides,
  };
}

describe("toVisit — estado", () => {
  it("waiting es en-espera", () => {
    expect(toVisit(fila({ status: "waiting" })).estado).toBe("en-espera");
  });

  it("in_progress es en-atencion", () => {
    expect(toVisit(fila({ status: "in_progress" })).estado).toBe("en-atencion");
  });

  it("completed es atendida", () => {
    expect(toVisit(fila({ status: "completed" })).estado).toBe("atendida");
  });

  it("cancelled es retirada", () => {
    expect(toVisit(fila({ status: "cancelled" })).estado).toBe("retirada");
  });

  it("no_show es retirada, igual que cancelled: para el dueño el resultado es el mismo", () => {
    expect(toVisit(fila({ status: "no_show" })).estado).toBe("retirada");
  });
});

describe("toVisit — el resto de los campos", () => {
  it("urgente es prioridad urgencia, si no normal", () => {
    expect(toVisit(fila({ is_urgent: true })).prioridad).toBe("urgencia");
    expect(toVisit(fila({ is_urgent: false })).prioridad).toBe("normal");
  });

  it("sin motivo cargado, muestra Consulta", () => {
    expect(toVisit(fila({ reason: null })).motivo).toBe("Consulta");
  });

  it("con motivo cargado, lo respeta", () => {
    expect(toVisit(fila({ reason: "Vacunación" })).motivo).toBe("Vacunación");
  });

  it("fecha y horaLlegada salen de checked_in_at en hora de Argentina", () => {
    const visit = toVisit(fila({ checked_in_at: "2026-08-11T14:05:00.000Z" }));
    expect(visit.fecha).toBe("2026-08-11");
    expect(visit.horaLlegada).toBe("11:05");
  });

  it("una llegada de noche en Argentina no se corre al día siguiente", () => {
    // 01:00 UTC del 12 son las 22:00 del 11 en Argentina (UTC-3).
    const visit = toVisit(fila({ checked_in_at: "2026-08-12T01:00:00.000Z" }));
    expect(visit.fecha).toBe("2026-08-11");
    expect(visit.horaLlegada).toBe("22:00");
  });

  it("horaSalida sale de completed_at, y queda indefinida si no se cerró", () => {
    expect(toVisit(fila({ completed_at: null })).horaSalida).toBeUndefined();
    expect(
      toVisit(fila({ completed_at: "2026-08-11T15:30:00.000Z" })).horaSalida,
    ).toBe("12:30");
  });

  it("veterinaria sale del embed de vet_institutions, vacía si no vino", () => {
    expect(
      toVisit(fila({ vet_institutions: { name: "Vet Central" } })).veterinaria,
    ).toBe("Vet Central");
    expect(toVisit(fila({ vet_institutions: null })).veterinaria).toBe("");
  });

  it("resumen prefiere el summary de mostrador sobre las observaciones", () => {
    expect(
      toVisit(
        fila({
          summary: "Control sin novedades",
          medical_records: { observations: "Se aplicó antirrábica" },
        }),
      ).resumen,
    ).toBe("Control sin novedades");
    expect(
      toVisit(
        fila({
          summary: "   ",
          medical_records: { observations: "Se aplicó antirrábica" },
        }),
      ).resumen,
    ).toBe("Se aplicó antirrábica");
    expect(
      toVisit(fila({ summary: "Control", medical_records: null })).resumen,
    ).toBe("Control");
  });

  it("resumen cae en medical_records cuando no hay summary", () => {
    expect(
      toVisit(
        fila({ medical_records: { observations: "Se aplicó antirrábica" } }),
      ).resumen,
    ).toBe("Se aplicó antirrábica");
    expect(toVisit(fila({ medical_records: null })).resumen).toBeUndefined();
  });

  it("profesionalId sale de checked_in_by_id, indefinido si nadie la registró", () => {
    expect(toVisit(fila({ checked_in_by_id: "vet1" })).profesionalId).toBe(
      "vet1",
    );
    expect(
      toVisit(fila({ checked_in_by_id: null })).profesionalId,
    ).toBeUndefined();
  });
});
