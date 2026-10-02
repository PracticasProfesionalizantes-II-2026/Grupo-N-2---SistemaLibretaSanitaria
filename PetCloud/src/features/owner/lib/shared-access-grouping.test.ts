import { describe, expect, it } from "vitest";

import type { SharedAccess } from "@/features/owner/data/owner-queries";
import {
  groupSharedAccessByPerson,
  petCountLabel,
} from "@/features/owner/lib/shared-access-grouping";

function access(overrides: Partial<SharedAccess>): SharedAccess {
  return {
    id: "id-1",
    nombre: "Sin nombre",
    email: "",
    mascota: "Firulais",
    petId: "pet-1",
    permiso: "Solo lectura",
    permission: "view",
    kind: "grant",
    ...overrides,
  };
}

describe("groupSharedAccessByPerson", () => {
  it("agrupa dos accesos de la misma persona (mismo userId) en un solo grupo", () => {
    const accesos = [
      access({
        id: "a1",
        userId: "user-1",
        nombre: "Roberto Fiorito",
        email: "roberto@example.com",
        mascota: "Firulais",
        petId: "pet-1",
      }),
      access({
        id: "a2",
        userId: "user-1",
        nombre: "Roberto Fiorito",
        email: "roberto@example.com",
        mascota: "Michi",
        petId: "pet-2",
      }),
    ];

    const grupos = groupSharedAccessByPerson(accesos);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].accesses).toHaveLength(2);
    expect(grupos[0].accesses.map((a) => a.mascota)).toEqual([
      "Firulais",
      "Michi",
    ]);
  });

  it("no mezcla personas distintas", () => {
    const accesos = [
      access({ id: "a1", userId: "user-1", nombre: "Roberto" }),
      access({ id: "a2", userId: "user-2", nombre: "Ana" }),
    ];

    const grupos = groupSharedAccessByPerson(accesos);

    expect(grupos).toHaveLength(2);
  });

  it("cae al email cuando no hay userId (invitación pendiente)", () => {
    const accesos = [
      access({
        id: "invite-1",
        kind: "invite",
        userId: undefined,
        email: "pendiente@example.com",
        mascota: "Firulais",
      }),
      access({
        id: "invite-2",
        kind: "invite",
        userId: undefined,
        email: "PENDIENTE@example.com",
        mascota: "Michi",
      }),
    ];

    const grupos = groupSharedAccessByPerson(accesos);

    // El email se compara sin distinguir mayúsculas: son la misma invitación.
    expect(grupos).toHaveLength(1);
    expect(grupos[0].accesses).toHaveLength(2);
  });

  it("sin userId ni email, cada fila queda en su propio grupo por id", () => {
    const accesos = [
      access({ id: "a1", userId: undefined, email: "" }),
      access({ id: "a2", userId: undefined, email: "" }),
    ];

    const grupos = groupSharedAccessByPerson(accesos);

    expect(grupos).toHaveLength(2);
  });

  it("mantiene el orden de primera aparición de cada persona", () => {
    const accesos = [
      access({ id: "a1", userId: "user-2", nombre: "Ana" }),
      access({ id: "a2", userId: "user-1", nombre: "Roberto" }),
      access({ id: "a3", userId: "user-2", nombre: "Ana", mascota: "Michi" }),
    ];

    const grupos = groupSharedAccessByPerson(accesos);

    expect(grupos.map((g) => g.nombre)).toEqual(["Ana", "Roberto"]);
    expect(grupos[0].accesses).toHaveLength(2);
  });
});

describe("petCountLabel", () => {
  it("usa singular para una sola mascota", () => {
    expect(petCountLabel(1)).toBe("1 mascota");
  });

  it("usa plural para más de una mascota", () => {
    expect(petCountLabel(2)).toBe("2 mascotas");
    expect(petCountLabel(0)).toBe("0 mascotas");
  });
});
