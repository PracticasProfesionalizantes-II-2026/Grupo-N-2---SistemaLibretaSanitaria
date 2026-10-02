import { describe, expect, it } from "vitest";

import {
  buildProductIndex,
  resolveByCode,
  searchProducts,
} from "@/features/erp/lib/product-index";
import type { Product } from "@/types/erp";

function producto(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    sku: "VAC-001",
    nombre: "Vacuna antirrábica",
    categoria: "Vacunas",
    unidad: "unidad",
    costo: 300,
    precio: 500,
    stock: 12,
    stockMinimo: 3,
    estado: "ok",
    activo: true,
    ...overrides,
  };
}

describe("resolución exacta por código", () => {
  it("un código registrado resuelve al producto", () => {
    const index = buildProductIndex(
      [producto()],
      [{ productId: "p1", code: "7791234567890" }],
    );

    expect(resolveByCode(index, "7791234567890")).toBe("p1");
  });

  it("un código no registrado no resuelve nada", () => {
    const index = buildProductIndex([producto()], []);

    expect(resolveByCode(index, "0000000000000")).toBeUndefined();
  });
});

describe("normalización GTIN", () => {
  it("un UPC-A escaneado a 12 dígitos resuelve al código guardado a 13 dígitos", () => {
    const index = buildProductIndex(
      [producto()],
      [{ productId: "p1", code: "0012345678905" }],
    );

    expect(resolveByCode(index, "012345678905")).toBe("p1");
  });

  it("un UPC-A escaneado a 13 dígitos resuelve al código guardado a 12 dígitos", () => {
    const index = buildProductIndex(
      [producto()],
      [{ productId: "p1", code: "012345678905" }],
    );

    expect(resolveByCode(index, "0012345678905")).toBe("p1");
  });

  it("un código EAN-8 resuelve por su forma normalizada", () => {
    const index = buildProductIndex(
      [producto()],
      [{ productId: "p1", code: "96385074" }],
    );

    expect(resolveByCode(index, "96385074")).toBe("p1");
  });

  it("un GTIN-14 válido resuelve exacto", () => {
    const index = buildProductIndex(
      [producto()],
      [{ productId: "p1", code: "07791234567898" }],
    );

    expect(resolveByCode(index, "07791234567898")).toBe("p1");
  });

  it("un código con dígito verificador inválido cae a comparación exacta", () => {
    const index = buildProductIndex(
      [producto()],
      [{ productId: "p1", code: "012345678906" }],
    );

    expect(resolveByCode(index, "012345678906")).toBe("p1");
    expect(resolveByCode(index, "12345678906")).toBeUndefined();
  });

  it("un código no-GTIN (letras) sigue comparando exacto", () => {
    const index = buildProductIndex(
      [producto()],
      [{ productId: "p1", code: "ABC-123" }],
    );

    expect(resolveByCode(index, "ABC-123")).toBe("p1");
    expect(resolveByCode(index, "ABC-124")).toBeUndefined();
  });

  it("un código de largo no estándar (10 dígitos) sigue comparando exacto", () => {
    const index = buildProductIndex(
      [producto()],
      [{ productId: "p1", code: "1234567890" }],
    );

    expect(resolveByCode(index, "1234567890")).toBe("p1");
    expect(resolveByCode(index, "1234567891")).toBeUndefined();
  });

  it("la normalización nunca reescribe el código almacenado", () => {
    const barcodes = [{ productId: "p1", code: "012345678905" }];
    buildProductIndex([producto()], barcodes);

    expect(barcodes[0].code).toBe("012345678905");
  });

  it("dos códigos guardados que normalizan a la misma clave: gana el primero", () => {
    const index = buildProductIndex(
      [producto({ id: "p1" }), producto({ id: "p2" })],
      [
        { productId: "p1", code: "012345678905" },
        { productId: "p2", code: "0012345678905" },
      ],
    );

    expect(resolveByCode(index, "0012345678905")).toBe("p1");
  });
});

describe("búsqueda por nombre, sku y categoría", () => {
  const index = buildProductIndex(
    [
      producto({ id: "p1", nombre: "Vacuna antirrábica", sku: "VAC-001" }),
      producto({
        id: "p2",
        nombre: "Alimento balanceado",
        sku: "ALI-002",
        categoria: "Alimentos",
      }),
    ],
    [],
  );

  it("encuentra por substring del nombre", () => {
    expect(searchProducts(index, "vacuna")).toEqual(["p1"]);
  });

  it("encuentra por substring del sku", () => {
    expect(searchProducts(index, "ali-002")).toEqual(["p2"]);
  });

  it("encuentra por substring de la categoría", () => {
    expect(searchProducts(index, "alimentos")).toEqual(["p2"]);
  });

  it("normaliza mayúsculas y diacríticos: 'ANTIRRABICA' encuentra 'antirrábica'", () => {
    expect(searchProducts(index, "ANTIRRABICA")).toEqual(["p1"]);
  });

  it("una búsqueda vacía no devuelve nada", () => {
    expect(searchProducts(index, "   ")).toEqual([]);
  });

  it("sin coincidencias devuelve una lista vacía", () => {
    expect(searchProducts(index, "inexistente")).toEqual([]);
  });
});
