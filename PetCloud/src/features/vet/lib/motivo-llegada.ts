import type { ConsultationValues } from "@/features/vet/schemas/vet-schemas";

/**
 * Lo que el motivo de llegada ya dice sobre la atención.
 *
 * Solo se mapea donde la correspondencia es obvia: "Herida o lesión" puede ser
 * una urgencia, un control o una cirugía, y adivinar ahí obliga a la
 * veterinaria a corregir un campo que parecía resuelto. Sin mapeo, el tipo
 * queda vacío y se elige a mano, como antes.
 */
const TIPO_POR_MOTIVO: Record<string, ConsultationValues["tipo"]> = {
  Vacunación: "vacunacion",
  Urgencia: "urgencia",
  "Control de rutina": "control",
  "Control post operatorio": "control",
};

/**
 * El motivo de la visita llega como "Motivo — detalle del mostrador": el
 * mapeo mira solo la parte del catálogo.
 */
export function tipoDesdeMotivo(
  motivo: string | undefined,
): ConsultationValues["tipo"] | undefined {
  if (!motivo) return undefined;
  const base = motivo.split(" — ")[0].trim();
  return TIPO_POR_MOTIVO[base];
}

/** Elegir "Urgencia" como motivo es, casi siempre, pedir que pase al frente. */
export function esMotivoUrgencia(motivo: string): boolean {
  return motivo === "Urgencia";
}
