import "server-only";

/**
 * El interruptor que decide cómo se compra Premium: checkout **simulado**
 * (sin plata de por medio) o checkout real de Mercado Pago.
 *
 * ---------------------------------------------------------------------------
 * ADVERTENCIA — leer antes de desplegar
 * ---------------------------------------------------------------------------
 * Mientras la simulación esté activa, **cualquier titular de institución puede
 * darse Premium gratis** con un clic, sin pagar ni pasar por ninguna pasarela.
 * Eso es exactamente lo que se busca para probar y para demostrar el producto,
 * y es exactamente lo que regala el producto si queda así en producción.
 *
 * Para volver al cobro real de Mercado Pago hay que definir, en el entorno del
 * servidor (`.env.local` en desarrollo, las variables del hosting en el
 * despliegue):
 *
 *     PREMIUM_CHECKOUT_SIMULADO=false
 *
 * Ese es el único valor que apaga la simulación. Cualquier otro valor —y la
 * ausencia de la variable— la deja encendida, a propósito: el modo activo hoy
 * es el simulado, y un interruptor que se apaga solo por un typo daría la
 * falsa sensación de que el cobro real está andando cuando no se configuró
 * nada.
 * ---------------------------------------------------------------------------
 *
 * Por qué un interruptor y no borrar el código de Mercado Pago: la integración
 * real está escrita, probada y funcionando (`lib/mercadopago.ts`, el webhook y
 * `subscription-actions.ts`, con sus siete suites). Volver atrás tiene que
 * costar cambiar un valor, no revertir commits — que es la forma segura de
 * perder de paso otra cosa.
 *
 * Es deliberadamente una variable de servidor y no `NEXT_PUBLIC_*`: quién
 * puede activarse Premium se decide en el servidor. Un componente cliente
 * nunca lee esto; la pantalla lo recibe como prop desde su página.
 */

/** El único valor que devuelve el checkout a Mercado Pago. */
const VALOR_QUE_APAGA_LA_SIMULACION = "false";

/**
 * `true` cuando el alta de Premium debe resolverse con el checkout simulado.
 *
 * Se lee como función y no como constante de módulo para que el valor se
 * evalúe en cada request: una constante congelaría el estado del entorno en el
 * momento en que el módulo se importó, y los tests no podrían cambiarlo.
 */
export function isPremiumCheckoutSimulado(): boolean {
  return (
    process.env.PREMIUM_CHECKOUT_SIMULADO !== VALOR_QUE_APAGA_LA_SIMULACION
  );
}
