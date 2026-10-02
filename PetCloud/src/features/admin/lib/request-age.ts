/**
 * Antigüedad de una solicitud pendiente (`/admin/validaciones`).
 *
 * El sitio público promete revisar las matrículas en 48 horas; la cola marca
 * las que ya pasaron ese plazo para que no queden enterradas.
 */
export const PLAZO_REVISION_HORAS = 48;

const HORA_MS = 60 * 60 * 1000;

/** Horas enteras transcurridas desde `desde` hasta `ahora` (nunca negativas). */
export function horasDesde(desde: string | Date, ahora: Date = new Date()) {
  const inicio = desde instanceof Date ? desde : new Date(desde);
  const diferencia = ahora.getTime() - inicio.getTime();
  if (!Number.isFinite(diferencia) || diferencia <= 0) return 0;
  return Math.floor(diferencia / HORA_MS);
}

/** "hace menos de una hora", "hace 5 horas", "hace 1 día", "hace 44 días". */
export function antiguedadSolicitud(
  desde: string | Date,
  ahora: Date = new Date(),
): string {
  const horas = horasDesde(desde, ahora);
  if (horas < 1) return "hace menos de una hora";
  if (horas < 24) return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/** `true` si la solicitud ya superó el plazo prometido. */
export function superaPlazo(
  desde: string | Date,
  ahora: Date = new Date(),
  plazoHoras: number = PLAZO_REVISION_HORAS,
): boolean {
  return horasDesde(desde, ahora) >= plazoHoras;
}
