import { Boxes, Contact, ShoppingCart, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { VET_BASE } from "@/config/vet-nav";

/**
 * Lo que la tarjeta promete, en una línea cada cosa. No es el detalle
 * completo del módulo —ese vive en `/veterinaria/premium`— sino lo mínimo
 * para que "Administración" deje de ser una palabra abstracta en el menú.
 */
const VENTAJAS = [
  { icon: Boxes, label: "Stock con semáforo de reposición" },
  { icon: ShoppingCart, label: "Ventas escaneando en el mostrador" },
  { icon: Wallet, label: "Caja con arqueo al cierre del día" },
  { icon: Contact, label: "Clientes con cuenta corriente" },
];

/**
 * Invitación a conocer el módulo de Administración, en el tablero de Gestión.
 *
 * Solo la dibuja `gestion/page.tsx` cuando la institución **no** tiene Premium
 * activo: con el módulo comprado no hay nada que ofrecer.
 *
 * Va sobre `bg-brand-surface` y no sobre una `Card` blanca a propósito: el
 * tablero ya es una grilla de tarjetas claras y una más se lee como un dato
 * más de la jornada: es una oferta, no una métrica.
 */
export function ErpUpsellCard({
  /**
   * Solo el titular puede dar de alta la suscripción:
   * `simulatePremiumCheckout()` pasa por
   * `requireInstitutionOwner()`, que tira excepción con cualquier otro rol.
   * Por eso el resto del equipo ve la misma propuesta pero sin botón de
   * compra: un botón que garantizado explota es peor que no tenerlo.
   */
  soyTitular,
}: {
  soyTitular: boolean;
}) {
  return (
    <section className="bg-brand-surface relative overflow-hidden rounded-xl p-6 text-white">
      <Sparkles className="absolute -top-8 -right-8 size-40 text-white/10" />

      <div className="relative">
        <p className="text-xs font-semibold tracking-wide text-white/75 uppercase">
          Módulo de Administración · Premium
        </p>
        <h2 className="mt-1.5 text-xl font-bold">
          Optimizá tu facturación y control de stock
        </h2>
        <p className="mt-2 max-w-xl text-sm text-white/80">
          Descubrí el módulo de Administración: el mostrador de la veterinaria
          —stock, ventas, caja y clientes— adentro del mismo panel donde ya
          atendés.
        </p>

        <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {VENTAJAS.map((ventaja) => (
            <li key={ventaja.label} className="flex items-center gap-2">
              <ventaja.icon className="size-4 shrink-0 text-white/75" />
              {ventaja.label}
            </li>
          ))}
        </ul>

        {soyTitular ? (
          /* Botón sobre superficie de marca: tratamiento fijo, no depende del tema. */
          <ButtonLink
            href={`${VET_BASE}/premium`}
            size="sm"
            className="text-brand-surface mt-5 bg-white hover:bg-white/90"
          >
            Hacete Premium
          </ButtonLink>
        ) : (
          <div className="mt-5">
            <p className="text-sm text-white/80">
              El alta la hace el titular de la institución. Pedísela y lo tienen
              andando el mismo día.
            </p>
            <Link
              href={`${VET_BASE}/premium`}
              className="mt-3 inline-flex h-9 items-center rounded-lg border border-white/40 px-3.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Ver qué incluye
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
