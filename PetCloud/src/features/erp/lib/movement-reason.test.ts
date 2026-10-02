import { describe, expect, it } from "vitest";

import {
  MOVEMENT_REASON_META,
  MOVEMENT_REASONS,
  kindDelMotivo,
  pideDireccion,
  signoDelMotivo,
} from "@/features/erp/lib/movement-reason";

/**
 * Lo que se prueba acá no es un diccionario: es que el libro de stock no pueda
 * mentir por un signo. Una merma guardada en positivo suma mercadería que se
 * rompió, y nadie la ve hasta que el recuento físico no cierra meses después.
 *
 * El otro invariante es contra la base: cada par motivo→kind de esta tabla
 * tiene que estar en el CHECK `stock_movements_reason_kind_coherentes`
 * (migración 114). Si alguien agrega un motivo acá y se olvida de la
 * migración, el INSERT falla en producción; esta prueba deja escrito cuál es
 * el par esperado para que la comparación sea de dos listas y no de memoria.
 */

describe("el catálogo cubre lo que dice cubrir", () => {
  it("la lista ordenada tiene todos los motivos y ninguno repetido", () => {
    expect([...MOVEMENT_REASONS].sort()).toEqual(
      Object.keys(MOVEMENT_REASON_META).sort(),
    );
  });

  it("el ajuste va primero: es el motivo más usado", () => {
    expect(MOVEMENT_REASONS[0]).toBe("ajuste_inventario");
  });
});

describe("kindDelMotivo", () => {
  it("mapea cada motivo al kind que espera el CHECK de la 114", () => {
    expect(
      MOVEMENT_REASONS.map((motivo) => [motivo, kindDelMotivo(motivo)]),
    ).toEqual([
      ["ajuste_inventario", "adjustment"],
      ["merma", "loss"],
      ["vencimiento", "loss"],
      ["consumo_interno", "use"],
      ["muestra_gratis", "use"],
      ["devolucion_cliente", "return"],
    ]);
  });

  it("ningún motivo deriva en purchase ni en sale", () => {
    // Esos dos kinds siguen existiendo en la base porque los escriben Compras
    // y Ventas. Lo que no puede volver a existir es una compra tipeada a mano
    // desde el modal, indistinguible de una real.
    const kinds = MOVEMENT_REASONS.map(kindDelMotivo);

    expect(kinds).not.toContain("purchase");
    expect(kinds).not.toContain("sale");
  });
});

describe("pideDireccion", () => {
  it("solo el ajuste de inventario pregunta sumar o restar", () => {
    expect(MOVEMENT_REASONS.filter(pideDireccion)).toEqual([
      "ajuste_inventario",
    ]);
  });
});

describe("signoDelMotivo", () => {
  it("las salidas restan", () => {
    expect(signoDelMotivo("merma")).toBe(-1);
    expect(signoDelMotivo("vencimiento")).toBe(-1);
    expect(signoDelMotivo("consumo_interno")).toBe(-1);
    expect(signoDelMotivo("muestra_gratis")).toBe(-1);
  });

  it("la devolución del cliente suma", () => {
    expect(signoDelMotivo("devolucion_cliente")).toBe(1);
  });

  it("el ajuste sigue lo que eligió la persona", () => {
    expect(signoDelMotivo("ajuste_inventario", false)).toBe(1);
    expect(signoDelMotivo("ajuste_inventario", true)).toBe(-1);
  });

  it("un ajuste sin dirección explícita suma", () => {
    // Es el default del formulario, y el que no sorprende: "cargué stock".
    expect(signoDelMotivo("ajuste_inventario")).toBe(1);
  });

  it("un `ajusteResta` colado no da vuelta una merma", () => {
    // El caso que convierte pérdida en mercadería. Que el signo lo fije el
    // motivo y no el llamador es exactamente lo que lo impide.
    expect(signoDelMotivo("merma", true)).toBe(-1);
    expect(signoDelMotivo("devolucion_cliente", true)).toBe(1);
  });
});
