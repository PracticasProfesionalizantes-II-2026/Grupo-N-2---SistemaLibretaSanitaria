import { describe, expect, it } from "vitest";

import type { ProductCardRow } from "@/features/erp/lib/stock-mappers";
import { estadoDeStock, toProduct } from "@/features/erp/lib/stock-mappers";

/**
 * El semáforo y la conversión de unidades: dos cosas puras que deciden lo que
 * la veterinaria ve en pantalla, y las dos tienen un caso límite que a ojo se
 * pasa por alto.
 */

describe("estadoDeStock", () => {
  it("marca negativo antes que cualquier otra cosa", () => {
    // Menos-que-cero también cumple menor-o-igual-que-el-mínimo. Si el orden
    // de los casos se invirtiera, esto devolvería "bajo" y el aviso de
    // "revisar carga" no aparecería nunca.
    expect(estadoDeStock(-2, 5)).toBe("negativo");
    expect(estadoDeStock(-2, 0)).toBe("negativo");
  });

  it("distingue cero de quedar poco", () => {
    expect(estadoDeStock(0, 5)).toBe("sin-stock");
    expect(estadoDeStock(3, 5)).toBe("bajo");
  });

  it("avisa cuando el stock llega justo al mínimo, no solo cuando lo pasa", () => {
    expect(estadoDeStock(5, 5)).toBe("bajo");
    expect(estadoDeStock(6, 5)).toBe("ok");
  });

  it("con mínimo en cero solo avisa al llegar a cero", () => {
    // Es el default de la columna: quien no configuró un mínimo no tiene que
    // recibir avisos de reposición por tener una unidad.
    expect(estadoDeStock(1, 0)).toBe("ok");
    expect(estadoDeStock(0, 0)).toBe("sin-stock");
  });

  it("soporta cantidades fraccionarias", () => {
    // Los insumos se miden en ml y g: redondear acá sería perder producto en
    // el papel.
    expect(estadoDeStock(0.5, 1)).toBe("bajo");
    expect(estadoDeStock(1.5, 1)).toBe("ok");
  });
});

const FILA: ProductCardRow = {
  id: "p1",
  sku: "VAC-001",
  name: "Antirrábica",
  category: "Vacunas",
  unit: "dosis",
  cost_cents: 125_050,
  price_cents: 250_000,
  min_stock: 10,
  stock: 4,
  active: true,
  presentation: null,
  laboratory: null,
};

describe("toProduct", () => {
  it("convierte centavos a pesos sin perder los decimales", () => {
    const producto = toProduct(FILA);

    expect(producto.costo).toBe(1250.5);
    expect(producto.precio).toBe(2500);
  });

  it("convierte los NUMERIC que PostgREST manda como string", () => {
    // PostgREST serializa NUMERIC como string para no perder precisión. Sin la
    // conversión, la comparación del semáforo sería entre cadenas y
    // `"10" <= "9"` daría verdadero.
    const producto = toProduct({
      ...FILA,
      stock: "10" as unknown as number,
      min_stock: "9" as unknown as number,
    });

    expect(producto.stock).toBe(10);
    expect(producto.stockMinimo).toBe(9);
    expect(producto.estado).toBe("ok");
  });

  it("calcula el estado a partir del stock ya convertido", () => {
    expect(toProduct(FILA).estado).toBe("bajo");
    expect(toProduct({ ...FILA, stock: -1 }).estado).toBe("negativo");
  });

  it("deja pasar los opcionales vacíos como null", () => {
    const producto = toProduct({ ...FILA, sku: null, category: null });

    expect(producto.sku).toBeNull();
    expect(producto.categoria).toBeNull();
  });
});
