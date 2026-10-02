import { describe, expect, it } from "vitest";

import { mostrarSeccionTurnos } from "./appointments-visibility";

describe("mostrarSeccionTurnos", () => {
  it("oculta la sección cuando nunca hubo un turno", () => {
    expect(mostrarSeccionTurnos([])).toBe(false);
  });

  it("la muestra apenas existe alguno, aunque sea pasado", () => {
    expect(mostrarSeccionTurnos([{ estado: "attended" }])).toBe(true);
  });
});
