/**
 * Plata en centavos de peso argentino (`amount_cents BIGINT`, migración 039).
 *
 * La base y el resto de la aplicación trabajan siempre en centavos: un entero
 * no tiene drift de redondeo.
 */

export function formatARS(cents: number) {
  return (cents / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
}

/**
 * Pesos → centavos, para lo que carga un admin en un formulario
 * (`/admin/planes`). `Math.round` evita el drift de punto flotante de
 * multiplicar decimales (`19.99 * 100` no da exactamente `1999` en JS).
 */
export function pesosToCents(pesos: number) {
  return Math.round(pesos * 100);
}
