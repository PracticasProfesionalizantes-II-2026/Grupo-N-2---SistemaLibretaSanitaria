import { describe, expect, it } from "vitest";

import {
  nombreCompleto,
  nombreVisible,
} from "@/features/admin/lib/display-name";

describe("nombreVisible", () => {
  it("usa el nombre cuando existe", () => {
    expect(nombreVisible(" Irene  Salgado ", "irene@x.com")).toBe(
      "Irene Salgado",
    );
  });

  it("cae al email cuando no hay nombre", () => {
    expect(nombreVisible(" ", "ana@x.com")).toBe("ana@x.com");
    expect(nombreVisible(null, "ana@x.com")).toBe("ana@x.com");
  });

  it("dice Sin nombre si tampoco hay email", () => {
    expect(nombreVisible("", "—")).toBe("Sin nombre");
    expect(nombreVisible(undefined, null)).toBe("Sin nombre");
  });
});

describe("nombreCompleto", () => {
  it("ignora partes vacías o nulas", () => {
    expect(nombreCompleto("Irene", "Salgado")).toBe("Irene Salgado");
    expect(nombreCompleto(null, "Salgado")).toBe("Salgado");
    expect(nombreCompleto("", null)).toBe("");
  });
});
