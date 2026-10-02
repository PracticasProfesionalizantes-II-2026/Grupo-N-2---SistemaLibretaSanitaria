"use client";

import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

const LocationMapCanvas = dynamic(
  () => import("@/components/ui/location-map-canvas"),
  {
    ssr: false,
    loading: () => <div className="bg-muted size-full animate-pulse" />,
  },
);

/** Google Maps buscando el texto que cargó la veterinaria, no el punto. */
function googleMapsAddressUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Mapa chico de una dirección, con OpenStreetMap.
 *
 * Es una vista previa: no se arrastra ni se hace zoom. Todo el mapa es un
 * enlace a Google Maps con la dirección tal como la escribió la veterinaria,
 * porque es ahí donde la persona arma el recorrido para llegar. La
 * atribución de OpenStreetMap (ODbL) queda por encima del enlace y se puede
 * clickear aparte.
 */
export function LocationMap({
  lat,
  lng,
  address,
  label,
  className,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  address: string;
  label?: string;
  className?: string;
}) {
  if (lat == null || lng == null) return null;

  return (
    <div
      className={cn(
        "border-border relative h-44 overflow-hidden rounded-xl border",
        // `isolate` crea un contexto de apilamiento propio: los z-index de
        // Leaflet (panes 400, controles 800–1000) y el del enlace quedan
        // contenidos acá y no compiten con el drawer (z-50) ni su overlay.
        "isolate",
        // Los controles de Leaflet van en z-index 1000 y el enlace en 999:
        // la atribución queda encima y se puede clickear aparte.
        "[&_.leaflet-control-attribution]:text-[10px]",
        className,
      )}
    >
      <LocationMapCanvas lat={lat} lng={lng} />
      <a
        href={googleMapsAddressUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir ${label ?? address} en Google Maps`}
        className="focus-visible:ring-brand-500 absolute inset-0 z-[999] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
      />
    </div>
  );
}
