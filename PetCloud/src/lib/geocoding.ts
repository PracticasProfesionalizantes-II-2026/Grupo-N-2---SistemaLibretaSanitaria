/**
 * Búsqueda de direcciones con autocompletado sobre Photon (OpenStreetMap).
 *
 * Photon y no Nominatim: la política de uso de Nominatim prohíbe
 * explícitamente el autocompletado (una consulta por tecla), y Photon está
 * hecho justamente para eso. No pide clave ni cuenta, y los datos son de
 * OpenStreetMap, así que la interfaz tiene que mostrar la atribución (ODbL).
 *
 * Este módulo es puro a propósito: arma la URL y traduce la respuesta, y el
 * `fetch` lo hace el componente. Así la traducción —que es donde están las
 * decisiones— se prueba sin red.
 */

export type AddressSuggestion = {
  /** Texto que queda en el campo: "Calle 123, Ciudad, Provincia". */
  label: string;
  lat: number;
  lng: number;
};

/** Se puede apuntar a una instancia propia de Photon sin tocar el código. */
const GEOCODER_URL =
  process.env.NEXT_PUBLIC_GEOCODER_URL || "https://photon.komoot.io/api/";

/**
 * Rectángulo de Argentina (oeste, sur, este, norte). Photon lo usa como
 * filtro duro; el `countrycode` se vuelve a mirar al traducir porque el
 * rectángulo también toca Chile, Uruguay, Paraguay y Bolivia.
 */
const ARGENTINA_BBOX = "-73.6,-55.1,-53.6,-21.7";

export const MIN_QUERY_LENGTH = 3;

/**
 * Sin `lang`: Photon solo traduce a `en`, `de` y `fr`, y cualquier otro
 * valor devuelve error. Sin el parámetro devuelve los nombres locales, que en
 * Argentina ya están en castellano.
 */
export function buildPhotonUrl(query: string, limit = 5): string {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(limit),
    bbox: ARGENTINA_BBOX,
  });
  return `${GEOCODER_URL}?${params.toString()}`;
}

type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    countrycode?: string;
  };
};

/**
 * Una feature de Photon → sugerencia, o `null` si no sirve (fuera de
 * Argentina, sin coordenadas válidas o sin nada que mostrar).
 *
 * El formato es el que escribiría una persona: calle y altura primero, y si
 * no hay calle (un lugar con nombre, un barrio), el nombre.
 */
export function mapPhotonFeature(
  feature: PhotonFeature,
): AddressSuggestion | null {
  const p = feature.properties ?? {};
  if (p.countrycode && p.countrycode.toUpperCase() !== "AR") return null;

  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  // GeoJSON: primero la longitud, después la latitud.
  const [lng, lat] = coords as [unknown, unknown];
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const calle = p.street
    ? [p.street, p.housenumber].filter(Boolean).join(" ")
    : p.name;
  const ciudad = p.city ?? p.district ?? p.county;

  const partes = [calle, ciudad, p.state].filter(
    (parte, i, todas): parte is string =>
      Boolean(parte) && todas.indexOf(parte) === i,
  );
  if (partes.length === 0) return null;

  return { label: partes.join(", "), lat, lng };
}

/** Traduce la respuesta entera y descarta repetidos (Photon los devuelve). */
export function parsePhotonResponse(json: unknown): AddressSuggestion[] {
  const features =
    json && typeof json === "object" && "features" in json
      ? (json as { features: unknown }).features
      : null;
  if (!Array.isArray(features)) return [];

  const vistos = new Set<string>();
  const sugerencias: AddressSuggestion[] = [];
  for (const feature of features) {
    const sugerencia = mapPhotonFeature(feature as PhotonFeature);
    if (!sugerencia || vistos.has(sugerencia.label)) continue;
    vistos.add(sugerencia.label);
    sugerencias.push(sugerencia);
  }
  return sugerencias;
}
