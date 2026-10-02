import { describe, expect, it } from "vitest";

import {
  buildPhotonUrl,
  mapPhotonFeature,
  parsePhotonResponse,
} from "@/lib/geocoding";

const feature = (
  properties: object,
  coordinates: unknown = [-58.38, -34.6],
) => ({
  geometry: { coordinates },
  properties,
});

describe("mapPhotonFeature", () => {
  it("arma calle y altura, ciudad y provincia; lat/lng desde GeoJSON", () => {
    expect(
      mapPhotonFeature(
        feature({
          street: "Avenida Corrientes",
          housenumber: "1234",
          city: "Buenos Aires",
          state: "Ciudad Autónoma de Buenos Aires",
          countrycode: "AR",
        }),
      ),
    ).toEqual({
      label:
        "Avenida Corrientes 1234, Buenos Aires, Ciudad Autónoma de Buenos Aires",
      lat: -34.6,
      lng: -58.38,
    });
  });

  it("sin calle usa el nombre y no repite partes iguales", () => {
    expect(
      mapPhotonFeature(
        feature({
          name: "Córdoba",
          city: "Córdoba",
          state: "Córdoba",
          countrycode: "ar",
        }),
      )?.label,
    ).toBe("Córdoba");
  });

  it("descarta resultados de otro país", () => {
    expect(
      mapPhotonFeature(feature({ name: "Montevideo", countrycode: "UY" })),
    ).toBeNull();
  });

  it("descarta coordenadas inválidas o ausentes", () => {
    expect(mapPhotonFeature(feature({ name: "X" }, [200, 0]))).toBeNull();
    expect(mapPhotonFeature(feature({ name: "X" }, null))).toBeNull();
    expect(mapPhotonFeature(feature({}, [-58, -34]))).toBeNull();
  });
});

describe("parsePhotonResponse", () => {
  it("filtra, deduplica y tolera respuestas rotas", () => {
    const f = feature({ name: "Plaza", city: "Rosario", countrycode: "AR" });
    expect(parsePhotonResponse({ features: [f, f] })).toHaveLength(1);
    expect(parsePhotonResponse(null)).toEqual([]);
    expect(parsePhotonResponse({ features: "no" })).toEqual([]);
  });
});

describe("buildPhotonUrl", () => {
  it("no manda lang (Photon no soporta es) y acota a Argentina", () => {
    const url = new URL(buildPhotonUrl("  corrientes 1234 "));
    expect(url.searchParams.get("q")).toBe("corrientes 1234");
    expect(url.searchParams.get("lang")).toBeNull();
    expect(url.searchParams.get("bbox")).toBeTruthy();
  });
});
