import { describe, expect, it } from "vitest";

import { calcularVuelto, textoDeVuelto } from "@/features/erp/lib/cash-change";
import { formatARS } from "@/lib/money";

/**
 * Lo que se prueba acá no es una resta: es que el número que se dice en voz
 * alta frente al cliente sea el correcto. Un vuelto de más sale del cajón y no
 * vuelve; un "faltan $0,00" con la plata justa frena la venta por nada.
 *
 * El campo no valida y no bloquea nada, así que todo lo que se puede tipear
 * —incluido nada— tiene que tener una respuesta decidida.
 */

describe("calcularVuelto", () => {
  it("sin monto cargado no dice nada", () => {
    expect(calcularVuelto(1500, "")).toEqual({ estado: "sin-dato" });
  });

  it("los espacios no son un monto", () => {
    expect(calcularVuelto(1500, "   ")).toEqual({ estado: "sin-dato" });
  });

  it("lo que no es un número no dice nada, en vez de propagar un NaN", () => {
    expect(calcularVuelto(1500, "abc")).toEqual({ estado: "sin-dato" });
  });

  it("un monto negativo no dibuja un vuelto mayor al total", () => {
    expect(calcularVuelto(1500, "-100")).toEqual({ estado: "sin-dato" });
  });

  it("con un total que todavía no es número no hay vuelto que calcular", () => {
    expect(calcularVuelto(NaN, "2000")).toEqual({ estado: "sin-dato" });
  });

  it("un cero escrito es un monto, y falta todo el total", () => {
    expect(calcularVuelto(1500, "0")).toEqual({
      estado: "falta",
      centavos: 150_000,
    });
  });

  it("el monto justo no deja vuelto", () => {
    expect(calcularVuelto(1500, "1500")).toEqual({ estado: "exacto" });
  });

  it("devuelve la diferencia, no el total", () => {
    expect(calcularVuelto(1523.5, "2000")).toEqual({
      estado: "vuelto",
      centavos: 47_650,
    });
  });

  it("lo que falta se informa en positivo, nunca como un vuelto negativo", () => {
    expect(calcularVuelto(1500, "1200")).toEqual({
      estado: "falta",
      centavos: 30_000,
    });
  });

  it("los centavos del monto cuentan", () => {
    expect(calcularVuelto(10.5, "10.75")).toEqual({
      estado: "vuelto",
      centavos: 25,
    });
  });

  it("el total con residuo de punto flotante sigue siendo un pago justo", () => {
    // `0.1 + 0.2` es `0.30000000000000004`: restado en pesos daría una
    // diferencia negativa y anunciaría que faltan $0,00.
    expect(calcularVuelto(0.1 + 0.2, "0.3")).toEqual({ estado: "exacto" });
  });

  it("redondea al centavo en vez de arrastrar un tercer decimal", () => {
    expect(calcularVuelto(10, "10.004")).toEqual({ estado: "exacto" });
  });
});

describe("textoDeVuelto", () => {
  it("sin monto cargado no escribe nada debajo del campo", () => {
    expect(textoDeVuelto({ estado: "sin-dato" })).toBeNull();
  });

  it("avisa que no hay que devolver nada", () => {
    expect(textoDeVuelto({ estado: "exacto" })).toBe(
      "Pago justo: no va vuelto.",
    );
  });

  it("dice cuánto devolver", () => {
    expect(textoDeVuelto({ estado: "vuelto", centavos: 47_650 })).toBe(
      `Vuelto: ${formatARS(47_650)}`,
    );
  });

  it("dice cuánto falta, sin signo menos", () => {
    const texto = textoDeVuelto({ estado: "falta", centavos: 30_000 });

    expect(texto).toBe(`Faltan ${formatARS(30_000)} para cubrir el total.`);
    expect(texto).not.toContain("-");
  });
});
