import { describe, expect, it } from "vitest";

import { webmailDeEmail } from "./webmail";

describe("webmailDeEmail", () => {
  it("reconoce Gmail", () => {
    expect(webmailDeEmail("alguien@gmail.com")).toEqual({
      nombre: "Gmail",
      url: "https://mail.google.com/",
    });
  });

  it("manda las cuatro marcas de Microsoft al mismo Outlook", () => {
    const nombres = [
      "a@outlook.com",
      "a@hotmail.com",
      "a@live.com",
      "a@msn.com",
    ].map((email) => webmailDeEmail(email)?.nombre);

    expect(nombres).toEqual(["Outlook", "Outlook", "Outlook", "Outlook"]);
  });

  it("reconoce las variantes argentinas, que son las que más se ven acá", () => {
    expect(webmailDeEmail("a@hotmail.com.ar")?.nombre).toBe("Outlook");
    expect(webmailDeEmail("a@yahoo.com.ar")?.nombre).toBe("Yahoo");
    expect(webmailDeEmail("a@live.com.ar")?.nombre).toBe("Outlook");
  });

  it("no distingue mayúsculas ni se traba con espacios al final", () => {
    expect(webmailDeEmail("Alguien@GMAIL.com")?.nombre).toBe("Gmail");
    expect(webmailDeEmail("alguien@gmail.com  ")?.nombre).toBe("Gmail");
  });

  /**
   * El corazón del fallback. Un dominio corporativo puede ser Google Workspace
   * por detrás, pero desde acá no hay forma de saberlo: adivinar manda a la
   * persona a una pantalla de login ajena. `null` es lo que hace que el botón
   * no se pinte.
   */
  it("devuelve null para un dominio que no reconoce", () => {
    expect(webmailDeEmail("alguien@volkode.com")).toBeNull();
    expect(webmailDeEmail("alguien@miveterinaria.com.ar")).toBeNull();
    expect(webmailDeEmail("alguien@fibertel.com.ar")).toBeNull();
  });

  it("devuelve null con entradas rotas o ausentes, sin explotar", () => {
    expect(webmailDeEmail("")).toBeNull();
    expect(webmailDeEmail(null)).toBeNull();
    expect(webmailDeEmail(undefined)).toBeNull();
    expect(webmailDeEmail("sin-arroba")).toBeNull();
    expect(webmailDeEmail("termina-en@")).toBeNull();
  });

  it("toma el dominio después de la ÚLTIMA arroba", () => {
    // Una dirección con arroba en la parte local es válida entre comillas. Con
    // `indexOf` el dominio saldría mal y el botón llevaría a cualquier lado.
    expect(webmailDeEmail('"raro@cosa"@gmail.com')?.nombre).toBe("Gmail");
  });

  it("no hace match por sufijo: un dominio que termina igual no alcanza", () => {
    // `nogmail.com` y `gmail.com.ar` no son Gmail. Si el día de mañana esto se
    // implementa con `endsWith`, este caso lo caza.
    expect(webmailDeEmail("a@nogmail.com")).toBeNull();
    expect(webmailDeEmail("a@gmail.com.ar")).toBeNull();
  });

  it("toda URL configurada es https y absoluta", () => {
    const emails = [
      "a@gmail.com",
      "a@outlook.com",
      "a@yahoo.com",
      "a@icloud.com",
      "a@proton.me",
      "a@zoho.com",
      "a@aol.com",
    ];

    for (const email of emails) {
      expect(webmailDeEmail(email)!.url).toMatch(/^https:\/\//);
    }
  });
});
