"use client";

import { useSyncExternalStore } from "react";

import {
  obtenerSituacion,
  obtenerSituacionServidor,
  suscribir,
} from "@/features/pwa/lib/install-prompt";
import type { SituacionInstalacion } from "@/features/pwa/lib/install-situation";

/**
 * Situación de instalación de este dispositivo; `null` en el servidor y
 * durante la hidratación, para que lo que dependa de ella no desajuste el HTML.
 */
export function useSituacionInstalacion(): SituacionInstalacion | null {
  return useSyncExternalStore(
    suscribir,
    obtenerSituacion,
    obtenerSituacionServidor,
  );
}
