/**
 * Atención por orden de llegada.
 *
 * La veterinaria no trabaja con turnos: la gente llega y espera. Lo que sí pasa
 * por el sistema es el registro de la llegada y de qué se le hizo a la mascota.
 * Por eso el modelo es una cola (`Visit`), no una agenda.
 */

export type VisitStatus =
  | "en-espera"
  | "en-atencion"
  | "atendida"
  /** Se fue antes de ser atendida. */
  | "retirada";

/** Una urgencia se atiende antes que la fila, pero queda marcada como tal. */
export type VisitPriority = "normal" | "urgencia";

export type Visit = {
  id: string;
  petId: string;
  veterinaria: string;
  fecha: string;
  /** Hora en que la mascota fue registrada en el mostrador. */
  horaLlegada: string;
  horaAtencion?: string;
  horaSalida?: string;
  motivo: string;
  prioridad: VisitPriority;
  estado: VisitStatus;
  profesionalId?: string;
  /** Qué se le hizo. Lo carga el veterinario al cerrar la atención. */
  resumen?: string;
};
