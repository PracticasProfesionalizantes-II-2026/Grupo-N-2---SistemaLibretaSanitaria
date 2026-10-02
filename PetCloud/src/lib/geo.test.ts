import { describe, expect, it } from "vitest";

import { distanceKm, formatKm } from "@/lib/geo";
import type { GeoPoint } from "@/types/geo";

const punto = (lat: number, lng: number): GeoPoint => ({
  lat,
  lng,
  direccion: "",
});

const OBELISCO = punto(-34.6037, -58.3816);
const LA_PLATA = punto(-34.9215, -57.9545);

describe("distanceKm", () => {
  it("da cero para el mismo punto", () => {
    expect(distanceKm(OBELISCO, OBELISCO)).toBe(0);
  });

  it("calcula una distancia conocida dentro del área metropolitana", () => {
    // Obelisco → La Plata son unos 53 km en línea recta.
    expect(distanceKm(OBELISCO, LA_PLATA)).toBeCloseTo(53, 0);
  });

  it("es simétrica: la ida mide lo mismo que la vuelta", () => {
    expect(distanceKm(OBELISCO, LA_PLATA)).toBeCloseTo(
      distanceKm(LA_PLATA, OBELISCO),
      10,
    );
  });

  it("da media circunferencia entre puntos antipodales", () => {
    // El antípoda pasa por el otro lado del planeta: ~20.015 km.
    expect(distanceKm(punto(0, 0), punto(0, 180))).toBeCloseTo(20015, 0);
  });

  it("cruza el antimeridiano sin inflar la distancia", () => {
    // Un grado de separación sigue siendo un grado, aunque el signo cambie.
    const cerca = distanceKm(punto(0, 179.5), punto(0, -179.5));
    expect(cerca).toBeLessThan(120);
  });
});

describe("formatKm", () => {
  it("usa un decimal por debajo de 10 km", () => {
    expect(formatKm(2.34)).toBe("2.3 km");
  });

  it("redondea a entero desde 10 km", () => {
    expect(formatKm(12.6)).toBe("13 km");
  });

  it("trata 10 como el límite: ya va sin decimales", () => {
    expect(formatKm(10)).toBe("10 km");
    expect(formatKm(9.99)).toBe("10.0 km");
  });

  it("muestra cero con decimal", () => {
    expect(formatKm(0)).toBe("0.0 km");
  });
});
