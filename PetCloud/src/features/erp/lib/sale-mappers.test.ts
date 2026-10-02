import { describe, expect, it } from "vitest";

import {
  calcularTotalPesos,
  toPaymentMethod,
  toSale,
  toSaleItem,
  type PaymentMethodRow,
  type SaleCardRow,
  type SaleItemCardRow,
} from "@/features/erp/lib/sale-mappers";

/**
 * Igual que `purchase-mappers.test.ts`: los puntos donde un centavo mal
 * convertido, un `NUMERIC` sin convertir, o una etiqueta de ruteo mal
 * mapeada arruinan lo que la veterinaria ve en pantalla — o peor, lo que
 * termina cobrando.
 */

const METODO: PaymentMethodRow = {
  code: "cuenta_corriente",
  label: "Cuenta corriente",
  posts_cash: false,
  posts_account: true,
  requires_customer: true,
  active: true,
};

describe("toPaymentMethod", () => {
  it("mapea el ruteo tal cual viene de la base", () => {
    const metodo = toPaymentMethod(METODO);

    expect(metodo.code).toBe("cuenta_corriente");
    expect(metodo.postsCash).toBe(false);
    expect(metodo.postsAccount).toBe(true);
    expect(metodo.requiresCustomer).toBe(true);
  });

  it("efectivo postea a caja y no exige cliente", () => {
    const metodo = toPaymentMethod({
      ...METODO,
      code: "efectivo",
      posts_cash: true,
      posts_account: false,
      requires_customer: false,
    });

    expect(metodo.postsCash).toBe(true);
    expect(metodo.postsAccount).toBe(false);
    expect(metodo.requiresCustomer).toBe(false);
  });
});

const VENTA: SaleCardRow = {
  id: "v1",
  customer_id: null,
  payment_method: "efectivo",
  status: "registered",
  total_cents: 150_000,
  created_by: "prof1",
  created_at: "2026-09-01T12:00:00Z",
};

describe("toSale", () => {
  it("convierte el total congelado de centavos a pesos", () => {
    const venta = toSale(VENTA, null, "Ana Pérez");

    expect(venta.totalPesos).toBe(1500);
    expect(venta.clienteNombre).toBeNull();
    expect(venta.responsable).toBe("Ana Pérez");
  });

  it("deja pasar el cliente identificado cuando lo hay", () => {
    const venta = toSale(
      { ...VENTA, customer_id: "c1", payment_method: "cuenta_corriente" },
      "Juan Dueño",
      "Ana Pérez",
    );

    expect(venta.clienteId).toBe("c1");
    expect(venta.clienteNombre).toBe("Juan Dueño");
    expect(venta.metodoPago).toBe("cuenta_corriente");
  });
});

const LINEA: SaleItemCardRow = {
  id: "i1",
  product_id: "prod1",
  quantity: 3,
  unit_price_cents: 50_000,
};

describe("toSaleItem", () => {
  it("convierte centavos a pesos sin perder los decimales", () => {
    const linea = toSaleItem(LINEA, "Vacuna antirrábica");

    expect(linea.precioUnitario).toBe(500);
    expect(linea.cantidad).toBe(3);
    expect(linea.productoNombre).toBe("Vacuna antirrábica");
  });

  it("convierte el NUMERIC que PostgREST manda como string", () => {
    const linea = { ...LINEA, quantity: "3" as unknown as number };

    expect(toSaleItem(linea, "X").cantidad).toBe(3);
  });
});

describe("calcularTotalPesos", () => {
  it("suma cantidad por precio unitario de cada línea", () => {
    const total = calcularTotalPesos([
      { cantidad: 2, precioUnitario: 500 },
      { cantidad: 1, precioUnitario: 1250.5 },
    ]);

    expect(total).toBe(2250.5);
  });

  it("una venta sin líneas totaliza cero", () => {
    expect(calcularTotalPesos([])).toBe(0);
  });
});
