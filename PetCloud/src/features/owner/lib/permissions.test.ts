import { describe, expect, it } from "vitest";

import {
  canEditPet,
  canManageAccess,
  rangoPermiso,
} from "@/features/owner/lib/permissions";

describe("rangoPermiso", () => {
  it("ordena view < edit < owner", () => {
    expect(rangoPermiso("view")).toBeLessThan(rangoPermiso("edit"));
    expect(rangoPermiso("edit")).toBeLessThan(rangoPermiso("owner"));
  });

  it("un permiso igual al ofrecido cuenta como 'igual o mayor'", () => {
    expect(rangoPermiso("view") >= rangoPermiso("view")).toBe(true);
  });

  it("un permiso tenido mayor al ofrecido cuenta como 'igual o mayor'", () => {
    expect(rangoPermiso("edit") >= rangoPermiso("view")).toBe(true);
    expect(rangoPermiso("owner") >= rangoPermiso("edit")).toBe(true);
  });

  it("un permiso tenido menor al ofrecido NO cuenta como 'igual o mayor'", () => {
    expect(rangoPermiso("view") >= rangoPermiso("edit")).toBe(false);
    expect(rangoPermiso("edit") >= rangoPermiso("owner")).toBe(false);
  });
});

describe("canEditPet", () => {
  it.each([
    ["view", false],
    ["edit", true],
    ["owner", true],
    [undefined, false],
  ] as const)("%s -> %s", (permiso, esperado) => {
    expect(canEditPet(permiso)).toBe(esperado);
  });
});

describe("canManageAccess", () => {
  it.each([
    ["view", false],
    ["edit", false],
    ["owner", true],
    [undefined, false],
  ] as const)("%s -> %s", (permiso, esperado) => {
    expect(canManageAccess(permiso)).toBe(esperado);
  });
});
