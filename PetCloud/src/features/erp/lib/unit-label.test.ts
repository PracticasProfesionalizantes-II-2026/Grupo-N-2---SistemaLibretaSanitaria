import { describe, expect, it } from "vitest";

import { etiquetaDeUnidad } from "@/features/erp/lib/unit-label";
import { PRODUCT_UNIT_LABELS, type ProductUnit } from "@/types/erp";

const PLURALES: Record<ProductUnit, string> = {
  unidad: "Unidades",
  caja: "Cajas",
  ml: "Mililitros",
  l: "Litros",
  g: "Gramos",
  kg: "Kilogramos",
  dosis: "Dosis",
};

describe("etiquetaDeUnidad", () => {
  it("devuelve el singular tal cual para una sola", () => {
    for (const unidad of Object.keys(PRODUCT_UNIT_LABELS) as ProductUnit[]) {
      expect(etiquetaDeUnidad(unidad, 1)).toBe(PRODUCT_UNIT_LABELS[unidad]);
    }
  });

  // Si alguien suma una unidad nueva al catálogo, esta prueba es la que avisa
  // que la regla no la cubre — antes que un cliente leyendo "3 litroes".
  it("pluraliza las siete etiquetas del catálogo", () => {
    for (const unidad of Object.keys(PRODUCT_UNIT_LABELS) as ProductUnit[]) {
      expect(etiquetaDeUnidad(unidad, 3)).toBe(PLURALES[unidad]);
    }
  });

  it("cuenta el cero en plural, como se habla", () => {
    expect(etiquetaDeUnidad("unidad", 0)).toBe("Unidades");
  });

  it("concuerda con el valor absoluto: el stock negativo no es un caso aparte", () => {
    expect(etiquetaDeUnidad("unidad", -1)).toBe("Unidad");
    expect(etiquetaDeUnidad("kg", -4)).toBe("Kilogramos");
  });

  it("deja Dosis intacta en los dos números", () => {
    expect(etiquetaDeUnidad("dosis", 1)).toBe("Dosis");
    expect(etiquetaDeUnidad("dosis", 9)).toBe("Dosis");
  });
});
