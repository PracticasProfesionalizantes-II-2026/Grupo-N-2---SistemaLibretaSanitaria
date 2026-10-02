"use client";

import { MapPinned } from "lucide-react";
import { useState } from "react";

import { LocationMap } from "@/components/ui/location-map";

/**
 * El mapa de una clínica del directorio, a pedido.
 *
 * El directorio es una lista sin pantalla de detalle, y un mapa por tarjeta
 * cargaría tiles de OpenStreetMap por cada clínica aunque nadie las mire —
 * justo lo que su política de uso pide evitar. Se abre solo el que se toca.
 */
export function VetLocationToggle({
  lat,
  lng,
  direccion,
  nombre,
}: {
  lat: number;
  lng: number;
  direccion: string;
  nombre: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="text-brand-700 hover:text-brand-800 inline-flex items-center gap-1 text-sm font-medium"
      >
        <MapPinned className="size-4" />
        {abierto ? "Ocultar mapa" : "Ver en el mapa"}
      </button>
      {abierto ? (
        <LocationMap
          lat={lat}
          lng={lng}
          address={direccion}
          label={nombre}
          className="mt-2"
        />
      ) : null}
    </div>
  );
}
