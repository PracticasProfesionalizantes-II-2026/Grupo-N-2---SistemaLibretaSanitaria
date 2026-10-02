import { Boxes, Contact, ShoppingCart, Truck, Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";

/**
 * Los cinco módulos de Administración, cada uno contado por lo que resuelve y
 * no por cómo se llama. El orden es el mismo que el del submenú
 * (`config/erp-nav.ts`): quien llegó acá desde un ítem con candado encuentra
 * la explicación en la misma posición donde vio el candado.
 *
 * "Facturación" no se lista aunque esté en el menú: todavía es
 * `proximamente`, y prometer en la pantalla de venta algo que no existe es la
 * forma más cara de vender.
 */
const MODULOS = [
  {
    icon: Boxes,
    titulo: "Stock",
    detalle:
      "Cada producto con su stock real y un semáforo que separa “queda poco” de “se acabó” de “falta cargar una entrada”, antes de que te enteres vendiendo.",
  },
  {
    icon: ShoppingCart,
    titulo: "Ventas",
    detalle:
      "Cobrás escaneando el código de barras en el mostrador. La venta descuenta stock y se postea sola a caja o a la cuenta corriente del cliente.",
  },
  {
    icon: Wallet,
    titulo: "Caja",
    detalle:
      "Un libro continuo de entradas y salidas, con arqueo al cierre del día. Un error se corrige con un contrasiento, nunca borrando el movimiento.",
  },
  {
    icon: Contact,
    titulo: "Clientes",
    detalle:
      "La cuenta corriente de cada cliente en la misma ficha: qué se llevó, qué debe y qué pagó, sin la planilla aparte que nadie termina de actualizar.",
  },
  {
    icon: Truck,
    titulo: "Compras y proveedores",
    detalle:
      "Registrás la compra al proveedor y las entradas de stock quedan hechas en el mismo movimiento, con el costo con el que después se calcula la ganancia.",
  },
];

/**
 * Qué te llevás con Premium, en concreto.
 *
 * Esta pantalla es el destino de los ítems con candado del menú y de la
 * tarjeta del tablero, así que tiene que responder "¿y esto qué hace?" sin
 * mandar a nadie a otra parte: quien llega no puede entrar a ver el módulo
 * —ese es justamente el motivo por el que está acá—.
 *
 * La ve cualquier profesional, titular o no: es información del producto, no
 * un control de facturación (eso sí es solo del titular).
 */
export function PremiumErpBenefits() {
  return (
    <Card className="mt-6 p-0">
      <div className="border-border border-b p-5">
        <h2 className="text-foreground font-semibold">
          Qué suma el módulo de Administración
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          El mostrador de la veterinaria adentro del mismo panel donde ya
          atendés: sin exportar nada, con los mismos clientes y las mismas
          personas del equipo.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
        {MODULOS.map((modulo) => (
          <li key={modulo.titulo} className="flex gap-3">
            <span className="bg-brand-50 text-brand-700 flex size-9 shrink-0 items-center justify-center rounded-lg">
              <modulo.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-foreground text-sm font-semibold">
                {modulo.titulo}
              </p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {modulo.detalle}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
