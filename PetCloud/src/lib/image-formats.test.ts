import { describe, expect, it } from "vitest";

import { ACCEPT_IMAGEN, validarImagenElegida } from "@/lib/image-formats";

const MB = 1024 * 1024;

function archivo(over: Partial<Parameters<typeof validarImagenElegida>[0]>) {
  return validarImagenElegida({
    name: "foto.jpg",
    type: "image/jpeg",
    size: MB,
    ...over,
  });
}

describe("validarImagenElegida", () => {
  it("acepta los formatos que un navegador sabe dibujar", () => {
    expect(archivo({ type: "image/jpeg", name: "a.jpg" }).ok).toBe(true);
    expect(archivo({ type: "image/png", name: "a.png" }).ok).toBe(true);
    expect(archivo({ type: "image/webp", name: "a.webp" }).ok).toBe(true);
  });

  // Varios selectores de archivo de Android entregan un JPG perfectamente
  // válido sin etiquetarlo. Rechazarlo por eso le niega la foto a alguien que
  // hizo todo bien, y es indistinguible de un error nuestro.
  it("decide por la extensión cuando el navegador no mandó el tipo", () => {
    expect(archivo({ type: "", name: "IMG_20240101.jpg" }).ok).toBe(true);
    expect(
      archivo({ type: "application/octet-stream", name: "foto.png" }).ok,
    ).toBe(true);
  });

  it("rechaza un archivo sin tipo cuya extensión tampoco sirve", () => {
    expect(archivo({ type: "", name: "informe.pdf" }).ok).toBe(false);
  });

  // Estos suben sin problema y después no los dibuja nadie: es el caso que deja
  // una imagen rota para siempre con un mensaje de éxito.
  it("rechaza los formatos que no se pueden mostrar en la web", () => {
    for (const caso of [
      { type: "image/heic", name: "IMG_0001.HEIC" },
      { type: "image/heif", name: "IMG_0002.heif" },
      { type: "", name: "IMG_0003.HEIC" },
      { type: "image/tiff", name: "escaneo.tif" },
    ]) {
      const resultado = archivo(caso);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok)
        expect(resultado.error).toMatch(/no se puede mostrar/i);
    }
  });

  it("nombra cuánto pesa la foto cuando pasa el máximo", () => {
    const resultado = archivo({ size: 9.4 * MB });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toContain("9,4 MB");
      expect(resultado.error).toContain("5 MB");
    }
  });

  it("valida el formato antes que el tamaño", () => {
    // Un HEIC de 12 MB tiene dos problemas. El que importa es el formato:
    // achicarlo no lo va a arreglar, y decir "pesa mucho" manda a la persona a
    // pelear con lo que no era.
    const resultado = archivo({
      type: "image/heic",
      name: "IMG.HEIC",
      size: 12 * MB,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/no se puede mostrar/i);
  });

  it("el accept del input no ofrece HEIC, para que iOS convierta a JPEG", () => {
    expect(ACCEPT_IMAGEN).not.toMatch(/hei[cf]/i);
    expect(ACCEPT_IMAGEN).toContain("image/jpeg");
    expect(ACCEPT_IMAGEN).toContain(".jpg");
  });
});
