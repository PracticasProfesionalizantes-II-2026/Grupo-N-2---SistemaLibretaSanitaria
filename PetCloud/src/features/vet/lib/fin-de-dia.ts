import { hoyArgentina } from "@/lib/argentina-time";

/**
 * Fin del día calendario de hoy en America/Argentina/Buenos_Aires, como
 * instante UTC listo para una columna `TIMESTAMPTZ`.
 *
 * Mismo problema que ya documentó el fix de `agruparPorFecha`
 * (`turnos-view.tsx`, commit `1e3a64b`): `new Date()` sin `Intl.DateTimeFormat`
 * de por medio usa la zona horaria del SISTEMA donde corre Node, no la de
 * Argentina — en producción o en CI eso suele ser UTC. La fecha calendario ("qué
 * día es hoy en Buenos Aires ahora mismo") siempre se obtiene con
 * `Intl.DateTimeFormat` explícito; el offset de Argentina (`-03:00`) es fijo
 * desde 2009 (no observa horario de verano), así que construir el instante de
 * fin de día con ese offset literal es correcto, no una suposición sobre
 * dónde corre el proceso.
 *
 * La usa `waiting-room-qr-actions.ts`, que emite un QR con vencimiento a fin del día calendario, y este
 * repositorio ya pagó una vez el costo de duplicar lógica sensible a zona
 * horaria (`hoyISO()` en `weight-record-schema.ts:33`, agregada porque
 * `toISOString().slice(0,10)` devuelve el día en UTC y cambia de fecha a las
 * 21:00 hora Argentina).
 */
export function finDeDiaLocal(fecha = new Date()): string {
  return `${hoyArgentina(fecha)}T23:59:59.999-03:00`;
}
