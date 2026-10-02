import type { GeoPoint } from "@/types/geo";

/**
 * Todo lo geográfico de la aplicación, en un solo lugar.
 *
 * Estaba partido en `geo.ts` y `geolocation.ts`: dos nombres casi iguales que
 * se importaban juntos en los mismos archivos, y que obligaban a abrir los dos
 * para saber cuál tenía lo que uno buscaba.
 */

// ---------------------------------------------------------------------------
// Cálculo puro. Corre igual en el servidor y en el navegador.
// ---------------------------------------------------------------------------

/**
 * Distancia en kilómetros entre dos puntos (fórmula del haversine).
 *
 * Alcanza y sobra para lo que hace la aplicación: decidir si una campaña queda
 * "cerca" y ordenar alertas por cercanía. No se usa para navegar — para eso
 * está el enlace a Google Maps.
 */
export function distanceKm(a: GeoPoint, b: GeoPoint) {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Redondeo con el que se muestran las distancias: 1 decimal debajo de 10 km. */
export function formatKm(km: number) {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

// ---------------------------------------------------------------------------
// Acceso a la API del navegador. Solo cliente: necesita `navigator`.
// ---------------------------------------------------------------------------
