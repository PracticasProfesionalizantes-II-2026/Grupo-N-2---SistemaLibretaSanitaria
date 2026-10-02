import { formatARS, pesosToCents } from "@/lib/money";

/**
 * El vuelto del mostrador: cuánto hay que devolver cuando alguien paga en
 * efectivo con un billete más grande que el total.
 *
 * Vive en `lib/` y es puro por el mismo motivo que `sale-pricing.ts`: no toca
 * React ni la base, así que los casos raros quedan decididos por escrito en
 * vez de librados a una resta escrita en medio del JSX.
 *
 * **Es una calculadora de mostrador, no un dato de la venta.** El monto que se
 * tipea no entra al payload de `registerSale()` ni a ninguna columna: la venta
 * que queda guardada es exactamente la misma se haya calculado el vuelto o no.
 * Por eso tampoco valida nada — no hay forma de "cargarlo mal", solo de no
 * cargarlo.
 *
 * Todo el cálculo pasa por centavos enteros (`@/lib/money`), que es como
 * trabaja la base. No es prolijidad: el total llega de sumar precios con
 * decimales, y `10.10 * 3` da `30.299999999999997`. Restando en pesos, pagar
 * los $30,30 justos deja una diferencia negativa de 1e-14 y la pantalla
 * anuncia que faltan $0,00 con la plata exacta sobre el mostrador.
 */

export type Vuelto =
  /** No hay nada honesto que decir todavía: campo vacío, o basura tipeada. */
  | { estado: "sin-dato" }
  | { estado: "exacto" }
  | { estado: "vuelto"; centavos: number }
  | { estado: "falta"; centavos: number };

/**
 * Los centavos de lo que el cliente puso sobre el mostrador, o `null` si eso
 * todavía no es un monto.
 *
 * El campo es un `<input type="number">`, así que el navegador ya devuelve
 * `""` por lo que no sabe parsear; el resto de los descartes son para que la
 * función tenga contrato propio y no dependa de esa cortesía. Un monto
 * negativo cae en `null` y no en una cuenta con signo: nadie entrega plata en
 * negativo, y mostrar un vuelto mayor al total sería inventar un resultado.
 */
function centavosRecibidos(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;

  const pesos = Number(limpio);
  if (!Number.isFinite(pesos) || pesos < 0) return null;

  return pesosToCents(pesos);
}

export function calcularVuelto(
  totalPesos: number,
  montoRecibido: string,
): Vuelto {
  const recibido = centavosRecibidos(montoRecibido);
  if (recibido === null) return { estado: "sin-dato" };

  // El total sale de `calcularTotalPesos()` sobre lo que hay en el carrito, y
  // una línea recién agregada tiene la cantidad en `NaN` hasta que alguien la
  // escribe. Contra un total que no es un número no hay vuelto que calcular.
  if (!Number.isFinite(totalPesos)) return { estado: "sin-dato" };

  const diferencia = recibido - pesosToCents(totalPesos);

  if (diferencia === 0) return { estado: "exacto" };
  if (diferencia < 0) return { estado: "falta", centavos: -diferencia };
  return { estado: "vuelto", centavos: diferencia };
}

/**
 * La frase que va debajo del campo, o `null` cuando no hay monto cargado.
 *
 * Que el texto se decida acá y no en el JSX es lo que permite probar que el
 * número anunciado es la diferencia y no el total —el error que cobraría de
 * más sin verse roto— y que la plata que falta nunca se diga en negativo.
 */
export function textoDeVuelto(vuelto: Vuelto): string | null {
  switch (vuelto.estado) {
    case "sin-dato":
      return null;
    case "exacto":
      return "Pago justo: no va vuelto.";
    case "vuelto":
      return `Vuelto: ${formatARS(vuelto.centavos)}`;
    case "falta":
      return `Faltan ${formatARS(vuelto.centavos)} para cubrir el total.`;
  }
}
