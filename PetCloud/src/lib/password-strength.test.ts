import { describe, expect, it } from "vitest";

import { getPasswordStrength } from "@/lib/password-strength";

describe("getPasswordStrength", () => {
  it("la cadena vacía es el piso, sin evaluar nada más", () => {
    expect(getPasswordStrength("")).toEqual({ score: 0, label: "Muy débil" });
  });

  it("una clave corta y sin variedad suma cero", () => {
    expect(getPasswordStrength("abc")).toEqual({
      score: 0,
      label: "Muy débil",
    });
  });

  it("ocho caracteres iguales suman solo por longitud", () => {
    expect(getPasswordStrength("aaaaaaaa")).toEqual({
      score: 1,
      label: "Débil",
    });
  });

  it("mezclar mayúsculas y minúsculas suma un punto", () => {
    expect(getPasswordStrength("aaaaAAAA").score).toBe(2);
  });

  it("sumar dígitos suma otro", () => {
    expect(getPasswordStrength("aaaaAAA1").score).toBe(3);
  });

  it("sumar un símbolo llega al máximo", () => {
    expect(getPasswordStrength("aaaAAA1!")).toEqual({
      score: 4,
      label: "Muy fuerte",
    });
  });

  it("doce caracteres cuentan la longitud dos veces", () => {
    // 12 de largo = 2 puntos, más minúscula+mayúscula = 3.
    expect(getPasswordStrength("aaaaaaAAAAAA").score).toBe(3);
  });

  it("recorta en 4 aunque se cumplan las cinco condiciones", () => {
    // Largo (2) + may/min (1) + dígito (1) + símbolo (1) = 5, tope en 4.
    const fuerte = getPasswordStrength("Contrasena123!");
    expect(fuerte.score).toBe(4);
    expect(fuerte.label).toBe("Muy fuerte");
  });

  it("una clave larga pero de un solo tipo no llega a fuerte", () => {
    expect(getPasswordStrength("aaaaaaaaaaaaaaaaaaaa").score).toBe(2);
  });
});
