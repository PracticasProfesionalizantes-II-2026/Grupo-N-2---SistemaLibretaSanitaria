import { describe, expect, it } from "vitest";

import {
  type Entorno,
  type EstadoInstalacion,
  detectarNavegadorManual,
  detectarSituacion,
  esFirefoxEscritorio,
  esIOS,
  leerEntorno,
} from "@/features/pwa/lib/install-situation";

const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
  firefoxLinux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  firefoxAndroid:
    "Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  desconocido: "SomeEmbeddedBrowser/1.0",
};

function entorno(userAgent: string, extra: Partial<Entorno> = {}): Entorno {
  return {
    userAgent,
    maxTouchPoints: 0,
    displayModeStandalone: false,
    navigatorStandalone: false,
    ...extra,
  };
}

const SIN_NADA: EstadoInstalacion = {
  hayEventoGuardado: false,
  appInstalada: false,
  errorServiceWorker: false,
};

describe("esIOS", () => {
  it("reconoce iPhone con cualquier navegador", () => {
    expect(esIOS(entorno(UA.safariIphone))).toBe(true);
    expect(esIOS(entorno(UA.chromeIos))).toBe(true);
  });

  it("reconoce el iPad moderno, que se presenta como Mac táctil", () => {
    expect(esIOS(entorno(UA.ipadOs, { maxTouchPoints: 5 }))).toBe(true);
  });

  it("no confunde una Mac sin pantalla táctil", () => {
    expect(esIOS(entorno(UA.safariMac, { maxTouchPoints: 0 }))).toBe(false);
  });
});

describe("detectarSituacion — sin evento guardado", () => {
  it.each([
    ["Chrome Windows", entorno(UA.chromeWindows), "manual"],
    ["Edge Windows", entorno(UA.edgeWindows), "manual"],
    ["Chrome Android", entorno(UA.chromeAndroid), "manual"],
    ["Samsung Internet", entorno(UA.samsungInternet), "manual"],
    ["Firefox Windows", entorno(UA.firefoxWindows), "sin-soporte"],
    ["Firefox Linux", entorno(UA.firefoxLinux), "sin-soporte"],
    ["Firefox Android", entorno(UA.firefoxAndroid), "firefox-android"],
    ["Safari iPhone", entorno(UA.safariIphone), "ios"],
    ["Chrome iOS", entorno(UA.chromeIos), "ios"],
    ["iPadOS", entorno(UA.ipadOs, { maxTouchPoints: 5 }), "ios"],
    ["Safari Mac", entorno(UA.safariMac), "manual"],
    ["desconocido", entorno(UA.desconocido), "sin-soporte"],
  ] as const)("%s → %s", (_, e, esperado) => {
    expect(detectarSituacion(e, SIN_NADA)).toBe(esperado);
  });
});

describe("detectarSituacion — prioridades", () => {
  it("el modo standalone gana sobre todo lo demás", () => {
    const estado = { ...SIN_NADA, hayEventoGuardado: true };
    expect(
      detectarSituacion(
        entorno(UA.chromeWindows, { displayModeStandalone: true }),
        { ...estado, errorServiceWorker: true },
      ),
    ).toBe("instalada");
    expect(
      detectarSituacion(
        entorno(UA.safariIphone, { navigatorStandalone: true }),
        estado,
      ),
    ).toBe("instalada");
  });

  it("appinstalled marca la app como instalada aunque la pestaña siga abierta", () => {
    expect(
      detectarSituacion(entorno(UA.chromeWindows), {
        ...SIN_NADA,
        hayEventoGuardado: true,
        appInstalada: true,
      }),
    ).toBe("instalada");
  });

  it("un evento guardado gana sobre lo que diga el user agent", () => {
    const estado = { ...SIN_NADA, hayEventoGuardado: true };
    expect(detectarSituacion(entorno(UA.chromeWindows), estado)).toBe(
      "instalable",
    );
    expect(detectarSituacion(entorno(UA.desconocido), estado)).toBe(
      "instalable",
    );
    expect(
      detectarSituacion(entorno(UA.chromeWindows), {
        ...estado,
        errorServiceWorker: true,
      }),
    ).toBe("instalable");
  });

  it("el error del service worker solo bloquea en Chromium", () => {
    const estado = { ...SIN_NADA, errorServiceWorker: true };
    expect(detectarSituacion(entorno(UA.chromeWindows), estado)).toBe(
      "bloqueado",
    );
    expect(detectarSituacion(entorno(UA.samsungInternet), estado)).toBe(
      "bloqueado",
    );
    expect(detectarSituacion(entorno(UA.safariIphone), estado)).toBe("ios");
    expect(detectarSituacion(entorno(UA.firefoxAndroid), estado)).toBe(
      "firefox-android",
    );
    expect(detectarSituacion(entorno(UA.firefoxWindows), estado)).toBe(
      "sin-soporte",
    );
    expect(detectarSituacion(entorno(UA.safariMac), estado)).toBe("manual");
  });
});

describe("detectarNavegadorManual", () => {
  it.each([
    [UA.safariMac, "safari-mac"],
    [UA.edgeWindows, "edge"],
    [UA.chromeAndroid, "chromium-android"],
    [UA.samsungInternet, "chromium-android"],
    [UA.chromeWindows, "chromium-escritorio"],
  ] as const)("%s → %s", (userAgent, esperado) => {
    expect(detectarNavegadorManual({ userAgent })).toBe(esperado);
  });
});

describe("esFirefoxEscritorio", () => {
  it("distingue Firefox de escritorio del de Android", () => {
    expect(esFirefoxEscritorio({ userAgent: UA.firefoxWindows })).toBe(true);
    expect(esFirefoxEscritorio({ userAgent: UA.firefoxAndroid })).toBe(false);
    expect(esFirefoxEscritorio({ userAgent: UA.chromeWindows })).toBe(false);
  });
});

describe("leerEntorno", () => {
  it("lee display-mode desde matchMedia", () => {
    const e = leerEntorno({
      navigator: { userAgent: UA.chromeAndroid, maxTouchPoints: 5 },
      matchMedia: (query) => ({
        matches: query === "(display-mode: standalone)",
      }),
    });
    expect(e).toEqual({
      userAgent: UA.chromeAndroid,
      maxTouchPoints: 5,
      displayModeStandalone: true,
      navigatorStandalone: false,
    });
  });

  it("devuelve false cuando matchMedia no coincide", () => {
    const e = leerEntorno({
      navigator: { userAgent: UA.chromeWindows },
      matchMedia: () => ({ matches: false }),
    });
    expect(e.displayModeStandalone).toBe(false);
    expect(e.maxTouchPoints).toBe(0);
  });

  it("no rompe si matchMedia no existe", () => {
    const e = leerEntorno({ navigator: { userAgent: UA.desconocido } });
    expect(e.displayModeStandalone).toBe(false);
  });

  it("no rompe si matchMedia tira una excepción", () => {
    const e = leerEntorno({
      navigator: { userAgent: UA.desconocido },
      matchMedia: () => {
        throw new Error("no soportado");
      },
    });
    expect(e.displayModeStandalone).toBe(false);
  });

  it("lee navigator.standalone de Safari en iOS", () => {
    const e = leerEntorno({
      navigator: { userAgent: UA.safariIphone, standalone: true },
    });
    expect(e.navigatorStandalone).toBe(true);
    expect(detectarSituacion(e, SIN_NADA)).toBe("instalada");
  });
});
