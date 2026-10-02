import { AlertTriangle, ShoppingCart, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { ERP_BASE, erpNav } from "@/config/erp-nav";
import {
  cantidadBajoMinimo,
  type ErpModulo,
  permisosDeModulos,
  resumenVentasDeHoy,
  saldoDeCaja,
} from "@/features/erp/data/dashboard";
import { requireErp } from "@/features/erp/lib/erp-session";

export const metadata: Metadata = { title: "Administración" };

/**
 * Qué permiso abre cada entrada del menú. Clientes no tiene permiso propio:
 * cuelga de `ventas` en la base (migración 104).
 */
const MODULO_DE_RUTA: Record<string, ErpModulo> = {
  [`${ERP_BASE}/stock`]: "stock",
  [`${ERP_BASE}/ventas`]: "ventas",
  [`${ERP_BASE}/clientes`]: "ventas",
  [`${ERP_BASE}/caja`]: "caja",
  [`${ERP_BASE}/compras`]: "compras",
};

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

/**
 * Portada del ERP: accesos a cada módulo y las cifras del día.
 *
 * Cada cifra y cada acceso se muestran solo si la persona tiene el permiso
 * del módulo; la consulta de permisos es la misma función que usa RLS. Las
 * cifras de un módulo sin permiso ni se piden. Si una lectura falla, esa
 * cifra muestra "—" y el resto de la pantalla sigue igual.
 */
export default async function ErpPage() {
  const session = await requireErp();
  const permisos = await permisosDeModulos();

  const [ventasHoy, saldo, bajoMinimo] = await Promise.all([
    permisos.ventas ? resumenVentasDeHoy() : null,
    permisos.caja ? saldoDeCaja() : null,
    permisos.stock ? cantidadBajoMinimo() : null,
  ]);

  const accesos = erpNav.filter(
    (item) =>
      !item.proximamente &&
      MODULO_DE_RUTA[item.href] &&
      permisos[MODULO_DE_RUTA[item.href]],
  );
  const enCamino = erpNav.filter((item) => item.proximamente);

  return (
    <div>
      <PageHeader
        title="Administración"
        description={`Gestión administrativa de ${session.institucion.nombre}.`}
      />

      {permisos.ventas || permisos.caja || permisos.stock ? (
        <section className="mt-6">
          <h2 className="text-foreground text-sm font-semibold">Hoy</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {permisos.ventas ? (
              <MetricCard
                icon={ShoppingCart}
                label="Ventas del día"
                value={ventasHoy ? pesos.format(ventasHoy.totalPesos) : "—"}
                hint={
                  ventasHoy
                    ? ventasHoy.cantidad === 1
                      ? "1 venta"
                      : `${ventasHoy.cantidad} ventas`
                    : "No pudimos cargar las ventas"
                }
                href={`${ERP_BASE}/ventas`}
              />
            ) : null}

            {permisos.caja ? (
              <MetricCard
                icon={Wallet}
                label="Efectivo en caja"
                value={saldo === null ? "—" : pesos.format(saldo)}
                hint={
                  saldo === null
                    ? "No pudimos cargar la caja"
                    : "Lo que debería haber en el cajón"
                }
                href={`${ERP_BASE}/caja`}
              />
            ) : null}

            {permisos.stock ? (
              <MetricCard
                icon={AlertTriangle}
                label="Productos para reponer"
                value={bajoMinimo === null ? "—" : bajoMinimo}
                hint={
                  bajoMinimo === null
                    ? "No pudimos cargar el stock"
                    : "En el mínimo o por debajo"
                }
                href={`${ERP_BASE}/stock?filtro=reponer`}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {accesos.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-foreground text-sm font-semibold">Módulos</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accesos.map((modulo) => (
              <li key={modulo.href}>
                <Link
                  href={modulo.href}
                  className="border-border bg-card hover:border-brand-300 flex items-center gap-3 rounded-lg border p-4 transition-colors"
                >
                  <modulo.icon className="text-brand-700 size-5 shrink-0" />
                  <span className="text-foreground text-sm font-medium">
                    {modulo.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {enCamino.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Próximamente
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {enCamino.map((modulo) => (
              <li
                key={modulo.href}
                className="border-border text-muted-foreground flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
              >
                <modulo.icon className="size-3.5 shrink-0" />
                {modulo.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
