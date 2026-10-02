"use client";

import {
  Building2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  LogOut,
  Menu,
  QrCode,
  Settings,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/ui/theme-toggle";
// `ERP_BASE` se importa desde `@/config/erp-nav` y no se rearma a mano desde
// `VET_BASE`. La frontera de una sola dirección que fija
// `src/features/erp/README.md` es entre *features* —el ERP lee de PetCloud,
// nunca al revés—, y `src/config/` no es una feature: es la capa de rutas que
// las dos comparten. `src/config/vet-nav.ts`, que es territorio PetCloud, ya
// consume `ERP_BASE` y `erpNav` de ese mismo archivo para armar la sección
// "Administración". Y no hay ciclo posible: `erp-nav.ts` toma `VET_BASE` de
// `app-routes.ts`, no de `vet-nav.ts`.
import { ERP_BASE } from "@/config/erp-nav";
import { VET_BASE } from "@/config/vet-nav";
import { PatientSearchBox } from "@/features/vet/components/patients/patient-search-box";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/features/auth/lib/use-sign-out";

export function VetTopbar({
  onOpenMobileNav,
}: {
  onOpenMobileNav: () => void;
}) {
  const { signOut } = useSignOut();
  const vet = useVetSession();
  const nombre = [vet?.usuario.nombre, vet?.usuario.apellido]
    .filter(Boolean)
    .join(" ");

  return (
    <header className="border-border bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex h-20 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="text-muted-foreground hover:bg-muted flex size-10 items-center justify-center rounded-lg lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="size-5" />
        </button>

        <PatientSearchBox />

        <div className="ml-auto flex items-center gap-1">
          {/*
            Un solo botón que cambia según el plan, en vez de uno que aparece y
            otro que desaparece: el lugar de la barra es el mismo y lo que
            ofrece es siempre "lo próximo que esta institución puede hacer".

            Sin Premium ofrece comprarlo. Con Premium ofrece vender, que es lo
            que se compró: la venta con el cliente esperando en el mostrador es
            el momento donde cada clic de más se nota, y tenerla acá la deja a
            uno solo desde cualquier pantalla del panel. El alta ya no hace
            falta mostrarla —"Mi suscripción" vive en el menú de la persona—.

            Los dos van `secondary` y nunca `primary` a propósito: "Escanear QR"
            es la acción clínica del día a día y tiene que seguir siendo el
            botón más fuerte de la barra. Dos `primary` compitiendo no dan dos
            acciones importantes, dan una barra sin jerarquía, y a los dos días
            el ojo saltea las dos.
          */}
          {vet?.premium.activo ? (
            <ButtonLink
              href={`${ERP_BASE}/ventas`}
              size="sm"
              variant="secondary"
              className="mr-1 hidden sm:inline-flex"
            >
              <ShoppingCart className="size-4" />
              Generar venta
            </ButtonLink>
          ) : (
            <ButtonLink
              href={`${VET_BASE}/premium`}
              size="sm"
              variant="secondary"
              className="mr-1 hidden sm:inline-flex"
            >
              <Sparkles className="size-4" />
              Hacete Premium
            </ButtonLink>
          )}

          <ButtonLink
            href={`${VET_BASE}/escanear`}
            size="sm"
            className="mr-1 hidden sm:inline-flex"
          >
            <QrCode className="size-4" />
            Escanear QR
          </ButtonLink>

          <ThemeToggle />

          <Dropdown
            triggerLabel={`Menú de la cuenta de ${nombre}`}
            trigger={(open) => (
              <span className="hover:bg-muted flex items-center gap-2 rounded-lg p-1.5">
                <Avatar name={nombre} size="sm" />
                <ChevronDown
                  className={cn(
                    "text-muted-foreground size-4 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </span>
            )}
          >
            {(close) => (
              <>
                <div className="border-border mb-1.5 border-b px-3 pt-1 pb-2.5">
                  <p className="text-foreground text-sm font-semibold">
                    {nombre}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {vet?.matricula} · {vet?.institucion.nombre}
                  </p>
                  {/* Estado del plan de la institución, no de la persona: dos
                      profesionales de la misma institución ven lo mismo acá. */}
                  <Badge
                    variant={vet?.premium.activo ? "brand" : "neutral"}
                    className="mt-2"
                  >
                    {vet?.premium.activo ? "Plan Premium" : "Plan gratuito"}
                  </Badge>
                </div>

                <Link
                  href={`${VET_BASE}/institucion`}
                  onClick={close}
                  className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                >
                  <Building2 className="size-4" />
                  Institución
                </Link>
                <Link
                  href={`${VET_BASE}/premium`}
                  onClick={close}
                  className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                >
                  <CreditCard className="size-4" />
                  {vet?.premium.activo ? "Mi suscripción" : "Hacerme Premium"}
                </Link>
                <Link
                  href={`${VET_BASE}/configuracion`}
                  onClick={close}
                  className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                >
                  <Settings className="size-4" />
                  Configuración
                </Link>
                <Link
                  href="/contacto?tipo=veterinaria"
                  onClick={close}
                  className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                >
                  <CircleHelp className="size-4" />
                  Ayuda
                </Link>

                <div className="border-border mt-1.5 border-t pt-1.5">
                  <DropdownItem
                    className="text-danger"
                    onClick={() => {
                      close();
                      signOut();
                    }}
                  >
                    <LogOut className="size-4" />
                    Cerrar sesión
                  </DropdownItem>
                </div>
              </>
            )}
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
