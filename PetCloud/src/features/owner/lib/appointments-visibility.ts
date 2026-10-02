/**
 * Cuándo tiene sentido mostrarle al dueño una sección de turnos.
 *
 * Los turnos los agenda la veterinaria, y solo si usa el módulo Premium. Para
 * la gran mayoría de los dueños nunca va a haber uno, y una tarjeta que dice
 * "no tiene turnos" para siempre es ruido: suena a algo que tendría que estar
 * haciendo y no hace.
 *
 * La señal es "ya hubo algún turno" (pasado, futuro o cancelado): el dueño que
 * alguna vez tuvo uno sabe que existe y sí le sirve ver el vacío. La otra señal
 * posible —"alguna de sus veterinarias ofrece turnos"— no es legible desde el
 * lado del dueño sin una RPC nueva (el plan de la institución no está expuesto
 * por RLS), así que no se usa.
 */
export function mostrarSeccionTurnos(turnos: readonly unknown[]): boolean {
  return turnos.length > 0;
}
