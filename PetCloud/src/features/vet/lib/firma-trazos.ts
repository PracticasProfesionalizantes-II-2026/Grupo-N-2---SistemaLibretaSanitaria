/**
 * Los trazos de una firma dibujada a mano, sin canvas y sin DOM.
 *
 * El componente que captura (`signature-pad.tsx`) guarda los trazos acá y no
 * solo en el bitmap, por una razón concreta: **un bitmap no se puede
 * deshacer**. Una vez que el trazo se pintó encima de los anteriores, no hay
 * forma de sacarlo sin repintar todo desde una lista, y esa lista es esta.
 *
 * Separado del componente para poder probarlo: la regla de "¿esto es una firma
 * o un manchón?" es la única del módulo que puede estar mal sin que se note en
 * pantalla, y es la que decide si alguien firma documentos clínicos con un
 * lienzo casi vacío.
 */

/** Un punto en coordenadas CSS del lienzo, no en píxeles del backing store. */
export type Punto = { x: number; y: number };

/** Un trazo es lo que pasa entre `pointerdown` y `pointerup`. */
export type Trazo = Punto[];

/**
 * Largo mínimo, en píxeles CSS, de la suma de todos los segmentos para que el
 * lienzo cuente como firmado.
 *
 * 150 px sobre un lienzo de 640 × 240: un garabato corto de una inicial ya lo
 * pasa, un toque accidental con el dedo no. Es un umbral de producto, no de
 * seguridad — el control real es que la persona ve su propio dibujo antes de
 * confirmarlo.
 */
export const LARGO_MINIMO = 150;

/** Largo total recorrido por un trazo, sumando segmento a segmento. */
export function largoDeTrazo(trazo: Trazo) {
  let total = 0;

  for (let i = 1; i < trazo.length; i++) {
    const dx = trazo[i].x - trazo[i - 1].x;
    const dy = trazo[i].y - trazo[i - 1].y;
    total += Math.hypot(dx, dy);
  }

  return total;
}

/** Largo total de todos los trazos juntos. */
export function largoTotal(trazos: Trazo[]) {
  return trazos.reduce((suma, trazo) => suma + largoDeTrazo(trazo), 0);
}

/**
 * ¿Hay tinta suficiente como para llamar a esto una firma?
 *
 * Se descartó escanear el lienzo con `getImageData` buscando píxeles no
 * transparentes: cuesta O(píxeles) en cada comprobación y, peor, **un solo
 * punto perdido lo pasa igual**. El largo recorrido responde la pregunta que
 * importa —¿alguien trazó algo?— y es una función pura que se puede probar.
 */
export function tintaSuficiente(trazos: Trazo[]) {
  return trazos.length > 0 && largoTotal(trazos) >= LARGO_MINIMO;
}

/**
 * Repinta el lienzo entero desde la lista de trazos.
 *
 * Se llama al deshacer y al borrar: las dos operaciones cambian la lista, y el
 * bitmap se reconstruye desde ella. `ancho` y `alto` van en píxeles CSS porque
 * el contexto ya viene escalado por `devicePixelRatio`.
 *
 * NUNCA pinta un fondo: el PNG tiene que salir con transparencia o el sello
 * tapa el texto del documento sobre el que se estampa.
 */
export function repintar(
  ctx: CanvasRenderingContext2D,
  trazos: Trazo[],
  ancho: number,
  alto: number,
) {
  ctx.clearRect(0, 0, ancho, alto);

  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";

  for (const trazo of trazos) {
    if (trazo.length === 0) continue;

    ctx.beginPath();
    ctx.moveTo(trazo[0].x, trazo[0].y);

    // Un trazo de un solo punto no dibuja nada con `lineTo`: se le repite el
    // punto para que el `lineCap` redondo lo convierta en el puntito que la
    // persona efectivamente hizo.
    if (trazo.length === 1) {
      ctx.lineTo(trazo[0].x, trazo[0].y);
    } else {
      for (let i = 1; i < trazo.length; i++) {
        ctx.lineTo(trazo[i].x, trazo[i].y);
      }
    }

    ctx.stroke();
  }
}
