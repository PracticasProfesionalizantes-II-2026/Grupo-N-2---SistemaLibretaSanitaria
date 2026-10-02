"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

/**
 * El mapa de Leaflet en sí. Vive aparte de `LocationMap` porque Leaflet toca
 * `window` apenas se importa: este archivo se carga solo en el navegador, con
 * `next/dynamic` y `ssr: false`.
 *
 * Tiles de tile.openstreetmap.org: sirven para el piloto, pero su política de
 * uso no admite tráfico pesado. Si el directorio crece, hay que pasar a un
 * proveedor de tiles (o uno propio) cambiando solo `TILE_URL`.
 */
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ZOOM = 15;

export default function LocationMapCanvas({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!contenedor.current) return;

    // Vista previa, no mapa navegable: todo lo que mueve el mapa apagado,
    // para que el click caiga en el enlace que lo envuelve.
    const m = L.map(contenedor.current, {
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomControl: false,
      attributionControl: true,
    });
    m.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);

    // CircleMarker y no Marker: el ícono por defecto de Leaflet pide imágenes
    // por URL relativa, que con el bundler de Next quedan rotas.
    const color =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--pc-brand-600")
        .trim() || "#0d9488";
    marcador.current = L.circleMarker([0, 0], {
      radius: 9,
      color: "#ffffff",
      weight: 3,
      fillColor: color,
      fillOpacity: 1,
    }).addTo(m);

    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    mapa.current?.setView([lat, lng], ZOOM);
    marcador.current?.setLatLng([lat, lng]);
  }, [lat, lng]);

  return <div ref={contenedor} className="size-full" />;
}
