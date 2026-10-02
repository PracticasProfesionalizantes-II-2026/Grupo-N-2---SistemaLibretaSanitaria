import { describe, expect, it } from "vitest";

import { mensajeSinPendientes } from "@/features/owner/components/health/vaccination-plan";

describe("mensajeSinPendientes", () => {
  it("sin ninguna vacuna cargada no dice 'al día'", () => {
    const mensaje = mensajeSinPendientes(["Luna"], true);
    expect(mensaje).toContain("Todavía no hay vacunas cargadas");
    expect(mensaje).not.toContain("al día");
  });

  it("con algunas mascotas sin vacunas, las nombra y no dice 'al día'", () => {
    const mensaje = mensajeSinPendientes(["Luna"], false);
    expect(mensaje).toContain("Luna todavía no tiene");
    expect(mensaje).not.toContain("al día");
  });

  it("con vacunas en todas y nada pendiente, sí está al día", () => {
    expect(mensajeSinPendientes([], false)).toContain("al día");
  });
});
