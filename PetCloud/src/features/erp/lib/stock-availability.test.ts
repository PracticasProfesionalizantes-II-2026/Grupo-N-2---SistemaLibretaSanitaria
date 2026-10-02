import { describe, expect, it } from "vitest";

import {
  faltantesDeStock,
  textoDeFalta,
  type LineaDeCarrito,
} from "@/features/erp/lib/stock-availability";
import type { Product } from "@/types/erp";

/**
 * Lo que se prueba acá no es una resta: es que el aviso llegue **antes** del
 * submit. Sin esto, la única defensa es el trigger de la migración 102, que
 * corre adentro de la transacción de `erp.register_sale()` y por lo tanto
 * voltea la venta entera — seis productos escaneados y el cliente enfrente.
 *
 * El caso que más importa es el de la suma por producto: dos líneas que por
 * separado entran en el stock y juntas no. Es el único que pasa desapercibido
 * mirando línea por línea, y es exactamente el que el trigger va a rechazar.
 */

const PRODUCTO: Product = {
  id: "p1",
  sku: "VAC-001",
  nombre: "Vacuna antirrábica",
  categoria: "Vacunas",
  unidad: "dosis",
  costo: 300,
  precio: 500,
  stock: 5,
  stockMinimo: 3,
  estado: "bajo",
  activo: true,
};

const OTRO: Product = {
  ...PRODUCTO,
  id: "p2",
  sku: "ALI-002",
  nombre: "Alimento balanceado",
  unidad: "kg",
  stock: 20,
  estado: "ok",
};

const linea = (productoId: string, cantidad?: number): LineaDeCarrito => ({
  productoId,
  cantidad,
});

describe("faltantesDeStock", () => {
  it("el carrito vacío no tiene faltantes", () => {
    expect(faltantesDeStock([], [PRODUCTO]).size).toBe(0);
  });

  it("deja pasar la cantidad que entra en el stock", () => {
    expect(faltantesDeStock([linea("p1", 5)], [PRODUCTO]).size).toBe(0);
  });

  it("marca la cantidad que excede el stock", () => {
    const faltantes = faltantesDeStock([linea("p1", 8)], [PRODUCTO]);

    expect(faltantes.get("p1")).toEqual({
      productoId: "p1",
      unidad: "dosis",
      pedido: 8,
      disponible: 5,
      lineas: 1,
    });
  });

  it("marca cualquier cantidad de un producto con stock cero", () => {
    const sinStock = { ...PRODUCTO, stock: 0, estado: "sin-stock" as const };

    expect(
      faltantesDeStock([linea("p1", 1)], [sinStock]).get("p1"),
    ).toMatchObject({ pedido: 1, disponible: 0 });
  });

  it("marca la venta de un producto que ya está en negativo en la base", () => {
    const negativo = { ...PRODUCTO, stock: -2, estado: "negativo" as const };

    expect(
      faltantesDeStock([linea("p1", 1)], [negativo]).get("p1"),
    ).toMatchObject({ pedido: 1, disponible: -2 });
  });

  /**
   * El caso que se escapa mirando línea por línea. El escaneo incrementa la
   * línea que ya existe, pero "Agregar línea" deja elegir el mismo producto de
   * nuevo: 3 + 3 contra 5 de stock no excede en ninguna de las dos y sí en la
   * transacción, que es donde cuenta.
   */
  it("suma las líneas del mismo producto en vez de mirarlas por separado", () => {
    const faltantes = faltantesDeStock(
      [linea("p1", 3), linea("p1", 3)],
      [PRODUCTO],
    );

    expect(faltantes.get("p1")).toMatchObject({
      pedido: 6,
      disponible: 5,
      lineas: 2,
    });
  });

  it("no inventa un faltante cuando las dos líneas del mismo producto entran juntas", () => {
    expect(
      faltantesDeStock([linea("p1", 2), linea("p1", 3)], [PRODUCTO]).size,
    ).toBe(0);
  });

  it("marca solo el producto que falta y no el resto del carrito", () => {
    const faltantes = faltantesDeStock(
      [linea("p1", 9), linea("p2", 4)],
      [PRODUCTO, OTRO],
    );

    expect([...faltantes.keys()]).toEqual(["p1"]);
  });

  it("una línea sin producto elegido todavía no puede faltar", () => {
    expect(faltantesDeStock([linea("", 99)], [PRODUCTO]).size).toBe(0);
  });

  /**
   * Una línea recién agregada tiene la cantidad vacía hasta que alguien la
   * escribe, y `valueAsNumber` la entrega como `NaN`. Si eso propagara, el
   * carrito entero quedaría marcado en rojo por un campo que nadie tocó.
   */
  it("la cantidad vacía (NaN) no pide nada y no marca la línea", () => {
    expect(faltantesDeStock([linea("p1", Number.NaN)], [PRODUCTO]).size).toBe(
      0,
    );
    expect(faltantesDeStock([linea("p1", undefined)], [PRODUCTO]).size).toBe(0);
  });

  it("la cantidad vacía tampoco marca un producto que ya está en negativo", () => {
    const negativo = { ...PRODUCTO, stock: -2, estado: "negativo" as const };

    expect(faltantesDeStock([linea("p1", Number.NaN)], [negativo]).size).toBe(
      0,
    );
  });

  it("la cantidad vacía no descuenta lo que sí piden las otras líneas", () => {
    const faltantes = faltantesDeStock(
      [linea("p1", 8), linea("p1", Number.NaN)],
      [PRODUCTO],
    );

    expect(faltantes.get("p1")).toMatchObject({ pedido: 8, lineas: 2 });
  });

  it("un producto que no está en el catálogo lo decide el trigger, no la pantalla", () => {
    expect(faltantesDeStock([linea("p-fantasma", 99)], [PRODUCTO]).size).toBe(
      0,
    );
    expect(faltantesDeStock([linea("p1", 99)], []).size).toBe(0);
  });

  it("respeta los decimales de la cantidad", () => {
    expect(faltantesDeStock([linea("p2", 20.5)], [OTRO]).size).toBe(1);
    expect(faltantesDeStock([linea("p2", 19.999)], [OTRO]).size).toBe(0);
  });
});

describe("textoDeFalta", () => {
  const falta = (extra: Partial<Parameters<typeof textoDeFalta>[0]>) =>
    textoDeFalta({
      productoId: "p1",
      unidad: "dosis",
      pedido: 8,
      disponible: 5,
      lineas: 1,
      ...extra,
    });

  it("dice cuánto se pide, cuánto hay, y las dos salidas", () => {
    expect(falta({})).toBe(
      "Pedís 8 y quedan 5 dosis. Bajá la cantidad o cargá la entrada desde Stock → «Registrar movimiento».",
    );
  });

  it("aclara que el total es de varias líneas, para que no se lea como un error de la pantalla", () => {
    expect(falta({ pedido: 6, lineas: 2 })).toBe(
      "Pedís 6 entre 2 líneas y quedan 5 dosis. Bajá la cantidad o cargá la entrada desde Stock → «Registrar movimiento».",
    );
  });

  it("con stock cero no ofrece bajar la cantidad: no hay cantidad que entre", () => {
    expect(falta({ pedido: 1, disponible: 0 })).toBe(
      "Sin stock: no queda nada para vender. Cargá la entrada desde Stock → «Registrar movimiento».",
    );
  });

  /**
   * Mismo criterio que `textoDeStock()`: el negativo no es "se acabó" sino
   * "falta cargar una entrada". Confundirlos manda a alguien a comprar
   * mercadería que ya está en el depósito.
   */
  it("distingue el negativo de la falta de stock", () => {
    expect(falta({ pedido: 1, disponible: -2 })).toBe(
      "El stock está en negativo (-2 dosis): cargá la entrada que falta desde Stock → «Registrar movimiento» antes de vender.",
    );
  });

  /**
   * La unidad concuerda con lo que queda, no con lo que se pide: la frase
   * dice "quedan 20 kilogramos" y el 20 es `disponible`. `etiquetaDeUnidad()`
   * resuelve el plural para las dos frases, así que esta y `textoDeStock()`
   * no pueden decir lo mismo de dos formas distintas debajo del mismo campo.
   */
  it("concuerda la unidad con lo que queda", () => {
    expect(falta({ unidad: "kg", pedido: 25, disponible: 20 })).toBe(
      "Pedís 25 y quedan 20 kilogramos. Bajá la cantidad o cargá la entrada desde Stock → «Registrar movimiento».",
    );
    expect(falta({ unidad: "kg", pedido: 3, disponible: 1 })).toBe(
      "Pedís 3 y quedan 1 kilogramo. Bajá la cantidad o cargá la entrada desde Stock → «Registrar movimiento».",
    );
  });
});
