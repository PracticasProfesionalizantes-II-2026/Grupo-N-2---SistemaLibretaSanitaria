import { describe, expect, it } from "vitest";

import {
  toPurchase,
  toSupplier,
  totalDeLineas,
  type PurchaseCardRow,
  type PurchaseItemCardRow,
  type SupplierCardRow,
} from "@/features/erp/lib/purchase-mappers";

/**
 * Los tres puntos donde un centavo mal convertido o un `NUMERIC` sin
 * convertir arruinan el total que la veterinaria ve en pantalla.
 */

const PROVEEDOR: SupplierCardRow = {
  id: "s1",
  name: "Distribuidora Vet SA",
  tax_id: "30-12345678-9",
  phone: "11-5555-5555",
  email: "ventas@distribuidoravet.com",
  active: true,
};

describe("toSupplier", () => {
  it("mapea los campos opcionales tal cual, sin inventar valores", () => {
    const proveedor = toSupplier(PROVEEDOR);

    expect(proveedor.nombre).toBe("Distribuidora Vet SA");
    expect(proveedor.cuit).toBe("30-12345678-9");
  });

  it("deja pasar los opcionales vacíos como null", () => {
    const proveedor = toSupplier({
      ...PROVEEDOR,
      tax_id: null,
      phone: null,
      email: null,
    });

    expect(proveedor.cuit).toBeNull();
    expect(proveedor.telefono).toBeNull();
    expect(proveedor.email).toBeNull();
  });
});

const LINEA_A: PurchaseItemCardRow = {
  id: "i1",
  purchase_id: "p1",
  product_id: "prod1",
  quantity: 5,
  unit_cost_cents: 70_000,
};

const LINEA_B: PurchaseItemCardRow = {
  id: "i2",
  purchase_id: "p1",
  product_id: "prod2",
  quantity: 2,
  unit_cost_cents: 125_050,
};

describe("totalDeLineas", () => {
  it("suma cantidad por costo unitario de cada línea, en pesos", () => {
    // 5 * 700 + 2 * 1250.50 = 3500 + 2501 = 6001
    expect(totalDeLineas([LINEA_A, LINEA_B])).toBe(6001);
  });

  it("una compra sin líneas totaliza cero", () => {
    expect(totalDeLineas([])).toBe(0);
  });

  it("convierte el NUMERIC que PostgREST manda como string", () => {
    // Sin la conversión, la multiplicación por un string da NaN o concatena.
    const linea = { ...LINEA_A, quantity: "5" as unknown as number };

    expect(totalDeLineas([linea])).toBe(3500);
  });
});

const COMPRA: PurchaseCardRow = {
  id: "p1",
  supplier_id: "s1",
  note: "Reposición mensual",
  created_by: "prof1",
  created_at: "2026-09-01T12:00:00Z",
};

describe("toPurchase", () => {
  it("arma el total a partir de sus líneas", () => {
    const compra = toPurchase(
      COMPRA,
      [LINEA_A, LINEA_B],
      "Distribuidora Vet SA",
      "Ana Pérez",
    );

    expect(compra.totalPesos).toBe(6001);
    expect(compra.proveedorNombre).toBe("Distribuidora Vet SA");
    expect(compra.responsable).toBe("Ana Pérez");
  });

  it("deja la nota en null cuando no se cargó ninguna", () => {
    const compra = toPurchase({ ...COMPRA, note: null }, [], "X", "Y");

    expect(compra.nota).toBeNull();
    expect(compra.totalPesos).toBe(0);
  });
});
