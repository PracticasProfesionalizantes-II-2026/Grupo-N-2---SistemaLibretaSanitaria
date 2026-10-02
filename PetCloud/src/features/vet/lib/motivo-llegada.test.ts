import { describe, expect, it } from "vitest";

import {
  esMotivoUrgencia,
  tipoDesdeMotivo,
} from "@/features/vet/lib/motivo-llegada";

describe("tipoDesdeMotivo", () => {
  it("mapea los motivos con correspondencia directa", () => {
    expect(tipoDesdeMotivo("Vacunación")).toBe("vacunacion");
    expect(tipoDesdeMotivo("Urgencia")).toBe("urgencia");
    expect(tipoDesdeMotivo("Control de rutina")).toBe("control");
    expect(tipoDesdeMotivo("Control post operatorio")).toBe("control");
  });

  it("ignora el detalle que se agrega en el mostrador", () => {
    expect(tipoDesdeMotivo("Vacunación — antirrábica anual")).toBe(
      "vacunacion",
    );
  });

  it("deja vacío lo ambiguo o desconocido", () => {
    expect(tipoDesdeMotivo("Herida o lesión")).toBeUndefined();
    expect(tipoDesdeMotivo("Consulta general")).toBeUndefined();
    expect(tipoDesdeMotivo("Otro")).toBeUndefined();
    expect(tipoDesdeMotivo("")).toBeUndefined();
    expect(tipoDesdeMotivo(undefined)).toBeUndefined();
  });
});

describe("esMotivoUrgencia", () => {
  it("solo el motivo Urgencia sugiere prioridad de urgencia", () => {
    expect(esMotivoUrgencia("Urgencia")).toBe(true);
    expect(esMotivoUrgencia("Vacunación")).toBe(false);
  });
});
