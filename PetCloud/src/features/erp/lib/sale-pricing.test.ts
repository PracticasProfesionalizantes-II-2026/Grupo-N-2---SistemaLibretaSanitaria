import { describe, expect, it } from "vitest";

import {
  buscarProducto,
  precioDeProducto,
  textoDeStock,
} from "@/features/erp/lib/sale-pricing";
import type { Product } from "@/types/erp";

/**
 * El precio que se autocompleta es el que termina cobrándose, así que lo que
 * se prueba acá no es un `find`: es que ninguno de los casos raros escriba en
 * el campo un número que nadie eligió. Un `undefined` o un `NaN` en el precio
 * unitario rompe el total en pantalla; un precio viejo que quedó de la línea
 * anterior cobra de más sin que nada se vea roto, que es peor.
 */

const PRODUCTO: Product = {
  id: "p1",
  sku: "VAC-001",
  nombre: "Vacuna antirrábica",
  categoria: "Vacunas",
  unidad: "dosis",
  costo: 300,
  precio: 500,
  stock: 12,
  stockMinimo: 3,
  estado: "ok",
  activo: true,
};

describe("buscarProducto", () => {
  it("encuentra el producto por id", () => {
    expect(buscarProducto([PRODUCTO], "p1")?.nombre).toBe("Vacuna antirrábica");
  });

  it("un id vacío no busca nada", () => {
    expect(buscarProducto([PRODUCTO], "")).toBeUndefined();
  });
});

describe("precioDeProducto", () => {
  it("devuelve el precio de lista, ya en pesos", () => {
    expect(precioDeProducto([PRODUCTO], "p1")).toBe(500);
  });

  it("no toca el campo cuando el producto no está en la lista", () => {
    expect(precioDeProducto([PRODUCTO], "p-inexistente")).toBeNull();
  });

  it("no toca el campo con el catálogo vacío", () => {
    expect(precioDeProducto([], "p1")).toBeNull();
  });

  it("no toca el campo cuando todavía no se eligió producto", () => {
    expect(precioDeProducto([PRODUCTO], "")).toBeNull();
  });

  it("escribe el cero cuando el producto vale cero, en vez de dejar el precio anterior", () => {
    expect(precioDeProducto([{ ...PRODUCTO, precio: 0 }], "p1")).toBe(0);
  });

  it("escribe cero cuando el producto vino sin precio", () => {
    const sinPrecio = { ...PRODUCTO, precio: undefined as unknown as number };

    expect(precioDeProducto([sinPrecio], "p1")).toBe(0);
  });

  it("escribe cero en vez de propagar un NaN de una fila corrupta", () => {
    expect(precioDeProducto([{ ...PRODUCTO, precio: NaN }], "p1")).toBe(0);
  });

  it("elige el producto correcto entre varios", () => {
    const otro = { ...PRODUCTO, id: "p2", precio: 1250.5 };

    expect(precioDeProducto([PRODUCTO, otro], "p2")).toBe(1250.5);
  });
});

describe("textoDeStock", () => {
  it("sin producto elegido no dice nada", () => {
    expect(textoDeStock(undefined)).toBeNull();
  });

  it("informa la cantidad disponible con su unidad", () => {
    expect(textoDeStock(PRODUCTO)).toBe("Stock disponible: 12 dosis.");
  });

  it("avisa cuando no queda nada", () => {
    expect(textoDeStock({ ...PRODUCTO, stock: 0, estado: "sin-stock" })).toBe(
      "Sin stock disponible.",
    );
  });

  it("distingue el negativo de la falta de stock: no se compra, se carga la entrada", () => {
    expect(textoDeStock({ ...PRODUCTO, stock: -2, estado: "negativo" })).toBe(
      "Stock en negativo (-2 dosis): falta cargar una entrada.",
    );
  });

  it("avisa el stock bajo sin bloquear la venta", () => {
    expect(textoDeStock({ ...PRODUCTO, stock: 2, estado: "bajo" })).toBe(
      "Stock bajo: quedan 2 dosis.",
    );
  });

  /**
   * El resto de las pruebas usa `dosis`, que en castellano no cambia de
   * número: con esa unidad sola, "quedan 20 kilogramo" pasaría entera sin que
   * nadie se entere. Por eso acá se cuenta en kilogramos.
   */
  it("concuerda la unidad con la cantidad", () => {
    const enKilos = { ...PRODUCTO, unidad: "kg" as const };

    expect(textoDeStock({ ...enKilos, stock: 20 })).toBe(
      "Stock disponible: 20 kilogramos.",
    );
    expect(textoDeStock({ ...enKilos, stock: 1 })).toBe(
      "Stock disponible: 1 kilogramo.",
    );
    expect(textoDeStock({ ...enKilos, stock: -2, estado: "negativo" })).toBe(
      "Stock en negativo (-2 kilogramos): falta cargar una entrada.",
    );
  });
});
