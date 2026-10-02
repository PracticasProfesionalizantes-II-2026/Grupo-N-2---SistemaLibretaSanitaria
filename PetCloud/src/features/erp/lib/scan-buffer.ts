/**
 * Buffer de escaneo (venta con lector de código de barras).
 *
 * Un lector HID no es una API del navegador: es un teclado que tipea muy
 * rápido. La única señal disponible es el TIEMPO entre teclas — la ráfaga del
 * lector llega en 30–50 ms por tecla, una persona tipeando anda en 80–100 ms.
 * `SCAN_MAX_GAP_MS = 60` se para justo en el medio de esas dos velocidades
 *.
 *
 * Puro a propósito: no llama a `Date.now()`, recibe el timestamp como
 * argumento. Quien lo use en React pasa `event.timeStamp`; el test pasa lo
 * que quiera. Sin esto, la lógica de ráfaga no se podría probar sin simular
 * el reloj del sistema.
 */

export const SCAN_MAX_GAP_MS = 60;

export type ScanBufferState = {
  /** Lo acumulado de la ráfaga en curso. Vacío cuando no hay ráfaga abierta. */
  buffer: string;
  /** `at` de la última tecla que entró al buffer, para medir el próximo gap. */
  lastAt: number | null;
};

export const ESTADO_INICIAL: ScanBufferState = { buffer: "", lastAt: null };

export type FeedKeyResult = {
  state: ScanBufferState;
  /** Presente solo cuando esta tecla cerró una ráfaga con `Enter`. */
  scan?: string;
};

/**
 * Reductor puro: una tecla entra, un estado nuevo sale, y a veces un scan
 * completo.
 *
 * `Enter` termina la ráfaga y la devuelve — vacía, si no se tipeó nada antes,
 * lo que el llamante debe ignorar (una ráfaga vacía no es un código). Un gap
 * mayor a `SCAN_MAX_GAP_MS` respecto de la última tecla reinicia el buffer
 * ANTES de procesar la tecla actual, así que una tecla que llega tarde
 * arranca una ráfaga nueva en vez de sumarse a la vieja.
 */
export function feedKey(
  state: ScanBufferState,
  event: { key: string; at: number },
): FeedKeyResult {
  const gapVencido =
    state.lastAt !== null && event.at - state.lastAt > SCAN_MAX_GAP_MS;

  const buffer = gapVencido ? "" : state.buffer;

  if (event.key === "Enter") {
    if (buffer.length === 0) {
      return { state: ESTADO_INICIAL };
    }

    return { state: ESTADO_INICIAL, scan: buffer };
  }

  // Teclas de un solo carácter, no modificadores ("Shift", "Tab", etc.): un
  // lector HID envía cada dígito/letra como su propia tecla imprimible.
  if (event.key.length !== 1) {
    return { state: { buffer, lastAt: event.at } };
  }

  return { state: { buffer: buffer + event.key, lastAt: event.at } };
}
