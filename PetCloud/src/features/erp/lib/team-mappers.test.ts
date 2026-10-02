import { describe, expect, it } from "vitest";

import { toTeamMember } from "@/features/erp/lib/team-mappers";

describe("toTeamMember", () => {
  const base = {
    id: "prof-1",
    role_in_institution: "professional",
    profiles: { first_name: "Ana", last_name: "Gómez" },
  };

  it("arma el nombre completo desde profiles", () => {
    const miembro = toTeamMember(base, []);
    expect(miembro.nombre).toBe("Ana Gómez");
  });

  it("usa un guión cuando profiles no tiene nombre cargado", () => {
    const miembro = toTeamMember({ ...base, profiles: null }, []);
    expect(miembro.nombre).toBe("—");
  });

  it("marca esTitular solo cuando role_in_institution es owner", () => {
    expect(toTeamMember(base, []).esTitular).toBe(false);
    expect(
      toTeamMember({ ...base, role_in_institution: "owner" }, []).esTitular,
    ).toBe(true);
  });

  it("conserva solo los módulos delegables vigentes", () => {
    const miembro = toTeamMember(base, ["caja", "compras"]);
    expect(miembro.modulosOtorgados).toEqual(["caja", "compras"]);
  });

  it("stock y ventas nunca aparecen como otorgados: no son delegables", () => {
    const miembro = toTeamMember(base, ["stock", "ventas", "equipo"]);
    expect(miembro.modulosOtorgados).toEqual(["equipo"]);
  });

  it("ignora un valor de módulo desconocido en vez de reventar", () => {
    const miembro = toTeamMember(base, ["caja", "modulo-inexistente"]);
    expect(miembro.modulosOtorgados).toEqual(["caja"]);
  });
});
