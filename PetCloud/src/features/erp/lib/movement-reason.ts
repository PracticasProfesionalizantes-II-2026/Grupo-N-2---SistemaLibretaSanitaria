import type { MovementKind, MovementReason } from "@/types/erp";

/**
 * El catálogo de motivos del movimiento manual de stock.
 *
 * Es la ÚNICA tabla de equivalencias entre lo que la persona elige y lo que se
 * guarda. La pantalla pregunta una sola cosa —por qué se mueve el stock— y de
 * esa respuesta salen las dos que la base necesita: el `kind` técnico y el
 * signo de la cantidad. Si el mapeo viviera en el componente, el segundo
 * formulario que escriba movimientos tendría que reconstruirlo de memoria, y
 * alcanzaría con que se equivoque en un signo para que el libro empiece a
 * mentir.
 *
 * `purchase` y `sale` NO tienen motivo, y es deliberado: una compra y una
 * venta se cargan en sus propios módulos, que además emiten el documento
 * comercial. Dejarlas también acá hacía que una compra tipeada a mano quedara
 * indistinguible de una real. El CHECK
 * `stock_movements_reason_kind_coherentes` (migración 114) es el espejo exacto
 * de esta tabla del lado de la base.
 *
 * Puro a propósito, como `sale-pricing.ts` o `scan-buffer.ts`: no toca React
 * ni base de datos, así que se prueba sin levantar nada.
 */

type MotivoMeta = {
  /** Lo que se lee en la pantalla. */
  label: string;
  /** Lo que se guarda en `erp.stock_movements.kind`. */
  kind: MovementKind;
  /**
   * El signo de la cantidad, o `null` cuando el motivo no lo determina.
   *
   * Solo el ajuste de inventario vale `null`: es el único que puede ir para
   * los dos lados. Preguntarle la dirección a los otros cinco sería pedir que
   * confirmen lo obvio, y abrir la puerta a cargar una merma en positivo.
   */
  signo: 1 | -1 | null;
};

export const MOVEMENT_REASON_META: Record<MovementReason, MotivoMeta> = {
  ajuste_inventario: {
    label: "Ajuste de inventario / Carga inicial",
    kind: "adjustment",
    signo: null,
  },
  merma: { label: "Mermas / Roturas", kind: "loss", signo: -1 },
  vencimiento: { label: "Vencimiento", kind: "loss", signo: -1 },
  consumo_interno: { label: "Consumo interno", kind: "use", signo: -1 },
  muestra_gratis: {
    label: "Muestra gratis / Bonificación",
    kind: "use",
    signo: -1,
  },
  devolucion_cliente: {
    label: "Devolución de cliente",
    kind: "return",
    signo: 1,
  },
};

/**
 * El orden en que se ofrecen, que no es el del objeto de arriba por casualidad
 * sino porque el `<select>` se recorre con la vista: primero el ajuste, que es
 * el que más se usa, y las salidas agrupadas.
 *
 * Que esta lista cubra todos los motivos lo prueba `movement-reason.test.ts`:
 * el `Record` de arriba es exhaustivo por tipo, pero una lista suelta no.
 */
export const MOVEMENT_REASONS = [
  "ajuste_inventario",
  "merma",
  "vencimiento",
  "consumo_interno",
  "muestra_gratis",
  "devolucion_cliente",
] as const satisfies readonly MovementReason[];

export function kindDelMotivo(motivo: MovementReason): MovementKind {
  return MOVEMENT_REASON_META[motivo].kind;
}

/** `true` solo para el ajuste de inventario: es el único que hay que preguntar. */
export function pideDireccion(motivo: MovementReason): boolean {
  return MOVEMENT_REASON_META[motivo].signo === null;
}

/**
 * El signo con el que se guarda la cantidad.
 *
 * `ajusteResta` se mira únicamente cuando el motivo no fija el signo. Que un
 * "restar" colado en una merma no pueda convertirla en entrada no es una
 * casualidad del llamador: es esta función.
 */
export function signoDelMotivo(
  motivo: MovementReason,
  ajusteResta = false,
): 1 | -1 {
  const { signo } = MOVEMENT_REASON_META[motivo];
  if (signo !== null) return signo;

  return ajusteResta ? -1 : 1;
}
