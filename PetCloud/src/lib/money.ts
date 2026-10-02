/**
 * Plata en centavos de peso argentino (`amount_cents BIGINT`, migración 039).
 *
 * La base y el resto de la aplicación trabajan siempre en centavos: un entero
 * no tiene drift de redondeo. Mercado Pago, en cambio, espera el monto en
 * pesos con hasta dos decimales — la conversión ocurre acá, en el borde con
 * esa API externa, nunca dentro de la base ni en medio de un cálculo.
 */

export function formatARS(cents: number) {
  return (cents / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
}

/** Centavos → pesos, el formato que espera el body de la API de Mercado Pago. */
export function centsToMpAmount(cents: number) {
  return Math.round(cents) / 100;
}

/**
 * Pesos → centavos, para lo que carga un admin en un formulario
 * (`/admin/planes`). `Math.round` evita el drift de punto flotante de
 * multiplicar decimales (`19.99 * 100` no da exactamente `1999` en JS).
 */
export function pesosToCents(pesos: number) {
  return Math.round(pesos * 100);
}
