import { describe, expect, it } from "vitest";

import {
  classifyScannedCode,
  extractQrCode,
  extractWaitingRoomQrCode,
  generateQrCode,
  generateWaitingRoomQrCode,
  isQrCode,
} from "@/lib/qr-code";

describe("generateQrCode", () => {
  it("genera el formato PC-XXXX-XXXX", () => {
    expect(generateQrCode()).toMatch(/^PC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("no usa caracteres confundibles (I, O, 0, 1, L, S, 5)", () => {
    const codigo = generateQrCode();
    expect(codigo).not.toMatch(/[IOL01S5]/);
  });
});

describe("isQrCode", () => {
  it("acepta el formato correcto", () => {
    expect(isQrCode("PC-8F3A-2K9D")).toBe(true);
  });

  it("es insensible a mayúsculas", () => {
    expect(isQrCode("pc-8f3a-2k9d")).toBe(true);
  });

  it("rechaza un formato distinto", () => {
    expect(isQrCode("8F3A2K9D")).toBe(false);
  });
});

describe("extractQrCode", () => {
  it("devuelve el código si ya viene pelado", () => {
    expect(extractQrCode("PC-8F3A-2K9D")).toBe("PC-8F3A-2K9D");
  });

  it("lo encuentra dentro de la URL pública completa que codifica el QR", () => {
    expect(extractQrCode("http://localhost:3000/p/PC-8F3A-2K9D")).toBe(
      "PC-8F3A-2K9D",
    );
  });

  it("lo encuentra en localhost, con puerto y sin protocolo", () => {
    expect(extractQrCode("localhost:3000/p/PC-8F3A-2K9D")).toBe("PC-8F3A-2K9D");
  });

  it("normaliza minúsculas", () => {
    expect(extractQrCode("http://localhost:3000/p/pc-8f3a-2k9d")).toBe(
      "PC-8F3A-2K9D",
    );
  });

  it("devuelve null si no hay ningún código adentro", () => {
    expect(extractQrCode("http://localhost:3000/inicio")).toBeNull();
  });

  it("devuelve null para un QR de otra cosa por completo", () => {
    expect(extractQrCode("WIFI:S:MiRed;T:WPA;P:clave123;;")).toBeNull();
  });
});

describe("generateWaitingRoomQrCode", () => {
  it("genera el formato PCW-XXXX-XXXX-XXXX", () => {
    expect(generateWaitingRoomQrCode()).toMatch(
      /^PCW-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
    );
  });

  it("no usa caracteres confundibles (I, O, 0, 1, L, S, 5)", () => {
    const codigo = generateWaitingRoomQrCode();
    expect(codigo).not.toMatch(/[IOL01S5]/);
  });
});

describe("extractWaitingRoomQrCode", () => {
  it("devuelve el código si ya viene pelado", () => {
    expect(extractWaitingRoomQrCode("PCW-8F3A-2K9D-7H4M")).toBe(
      "PCW-8F3A-2K9D-7H4M",
    );
  });

  it("lo encuentra dentro de la URL pública completa que codifica el QR", () => {
    expect(
      extractWaitingRoomQrCode(
        "http://localhost:3000/visitas/ingreso/PCW-8F3A-2K9D-7H4M",
      ),
    ).toBe("PCW-8F3A-2K9D-7H4M");
  });

  it("devuelve null para un código de collar (PC-, no PCW-)", () => {
    expect(extractWaitingRoomQrCode("PC-8F3A-2K9D")).toBeNull();
  });
});

describe("no colisión entre PC- y PCW-", () => {
  it("un código de sala de espera no matchea como collar", () => {
    expect(extractQrCode("PCW-8F3A-2K9D-7H4M")).toBeNull();
  });

  it("un código de collar no matchea como sala de espera", () => {
    expect(extractWaitingRoomQrCode("PC-8F3A-2K9D")).toBeNull();
  });
});

describe("classifyScannedCode", () => {
  it("clasifica un código de collar", () => {
    expect(classifyScannedCode("PC-8F3A-2K9D")).toEqual({
      tipo: "collar",
      codigo: "PC-8F3A-2K9D",
    });
  });

  it("clasifica un código de sala de espera", () => {
    expect(classifyScannedCode("PCW-8F3A-2K9D-7H4M")).toEqual({
      tipo: "sala",
      codigo: "PCW-8F3A-2K9D-7H4M",
    });
  });

  it("clasifica un código de sala de espera embebido en la URL pública", () => {
    expect(
      classifyScannedCode(
        "http://localhost:3000/visitas/ingreso/PCW-8F3A-2K9D-7H4M",
      ),
    ).toEqual({ tipo: "sala", codigo: "PCW-8F3A-2K9D-7H4M" });
  });

  it("nunca confunde PCW- con PC-", () => {
    const resultado = classifyScannedCode("PCW-8F3A-2K9D-7H4M");
    expect(resultado?.tipo).toBe("sala");
  });

  it("devuelve null para basura sin forma de ninguno de los dos formatos", () => {
    expect(classifyScannedCode("WIFI:S:MiRed;T:WPA;P:clave123;;")).toBeNull();
  });

  it("devuelve null para una URL con forma de link pero sin ningún código adentro", () => {
    expect(classifyScannedCode("http://localhost:3000/inicio")).toBeNull();
  });

  it("devuelve null para una URL de otra app que no es ni PC- ni PCW-", () => {
    expect(
      classifyScannedCode("https://otraapp.com/x/ABCD-1234-EFGH"),
    ).toBeNull();
  });
});
