export type GeoPoint = {
  lat: number;
  lng: number;
  /** Texto legible de la ubicación, para mostrar y para buscar en Google Maps. */
  direccion: string;
};
