"use client";

import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  ChevronsLeft,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { Logo } from "@/components/layout/logo";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/features/auth/lib/use-sign-out";

export type ShellNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type AppShellProps = {
  children: ReactNode;
  nav: readonly ShellNavItem[];
  /** A dónde vuelve el logo dentro del panel. */
  homeHref: string;
  /** Bloque de contexto arriba del menú: "INSTITUCIÓN / Veterinaria San Roque". */
  context?: { label: string; value: string };
  user: { nombre: string; detalle: string };
  settingsHref: string;
  /** Contenido a la izquierda del topbar (buscador, selector). */
  topbarStart?: ReactNode;
  /** Botones extra a la derecha, antes del tema. */
  topbarActions?: ReactNode;
  /** Ítems extra del menú de usuario. */
  menuExtras?: ReactNode;
  footerLabel: string;
  /** Resuelve el href de un ítem que depende del estado (ej. "Salud" del dueño). */
  resolveHref?: (item: ShellNavItem) => string;
  /** Marca activo un ítem con lógica propia. */
  isItemActive?: (item: ShellNavItem, pathname: string) => boolean;
};

/**
 * Estructura de aplicación compartida por los cuatro paneles.
 *
 * Sidebar colapsable, menú móvil, topbar y footer son idénticos en Dueño,
 * Veterinaria, Municipio y Backoffice; lo único que cambia es la navegación y
 * lo que cada rol pone en el topbar. Vivía duplicado en cada panel hasta que
 * fueron cuatro.
 */
export function AppShell({
  children,
  nav,
  homeHref,
  context,
  user,
  settingsHref,
  topbarStart,
  topbarActions,
  menuExtras,
  footerLabel,
  resolveHref,
  isItemActive,
}: AppShellProps) {
  const pathname = usePathname();
  const { signOut } = useSignOut();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const hrefFor = (item: ShellNavItem) =>
    resolveHref ? resolveHref(item) : item.href;

  const activeFor = (item: ShellNavItem) => {
    if (isItemActive) return isItemActive(item, pathname);
    const href = hrefFor(item);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="bg-background min-h-svh">
      <aside
        className={cn(
          "border-border bg-card fixed inset-y-0 left-0 z-40 hidden flex-col border-r transition-[width] lg:flex",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <div
          className={cn(
            "border-border flex h-20 items-center border-b px-5",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <Link
              href={homeHref}
              className="bg-brand-600 flex size-9 items-center justify-center rounded-lg text-white"
              aria-label="PetCloud"
            >
              <span className="text-sm font-bold">PC</span>
            </Link>
          ) : (
            <Logo href={homeHref} />
          )}
        </div>

        {context && !collapsed ? (
          <div className="border-border border-b px-5 py-3">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              {context.label}
            </p>
            <p className="text-foreground mt-1 truncate text-sm font-medium">
              {context.value}
            </p>
          </div>
        ) : null}

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={hrefFor(item)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                activeFor(item)
                  ? "bg-brand-50 text-brand-700"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-5 shrink-0" />
              {collapsed ? null : item.label}
            </Link>
          ))}
        </nav>

        <div className="border-border border-t p-3">
          <Link
            href={settingsHref}
            className={cn(
              "hover:bg-muted flex items-center gap-3 rounded-lg p-2",
              collapsed && "justify-center",
            )}
            title={collapsed ? "Configuración" : undefined}
          >
            <Avatar name={user.nombre} size="sm" />
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">
                    {user.nombre}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {user.detalle}
                  </span>
                </span>
                <Settings className="text-muted-foreground size-4 shrink-0" />
              </>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "text-muted-foreground hover:bg-muted hover:text-foreground mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            <ChevronsLeft
              className={cn(
                "size-5 shrink-0 transition-transform",
                collapsed && "rotate-180",
              )}
            />
            {collapsed ? null : "Colapsar"}
          </button>
        </div>
      </aside>

      {mobileNavOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <aside className="border-border bg-card fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r lg:hidden">
            <div className="border-border flex h-20 items-center justify-between border-b px-5">
              <Logo href={homeHref} />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-lg"
                aria-label="Cerrar menú"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={hrefFor(item)}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                    activeFor(item)
                      ? "bg-brand-50 text-brand-700"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-5" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        </>
      ) : null}

      <div
        className={cn(
          "transition-[padding]",
          collapsed ? "lg:pl-20" : "lg:pl-64",
        )}
      >
        <header className="border-border bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex h-20 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="text-muted-foreground hover:bg-muted flex size-10 items-center justify-center rounded-lg lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </button>

            {topbarStart}

            <div className="ml-auto flex items-center gap-1">
              {topbarActions}
              <ThemeToggle />

              <Dropdown
                trigger={(open) => (
                  <span className="hover:bg-muted flex items-center gap-2 rounded-lg p-1.5">
                    <Avatar name={user.nombre} size="sm" />
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
                        {user.nombre}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {user.detalle}
                      </p>
                    </div>

                    {menuExtras}

                    <Link
                      href={settingsHref}
                      onClick={close}
                      className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                    >
                      <Settings className="size-4" />
                      Configuración
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

        <main className="p-4 sm:p-6">{children}</main>

        <footer className="border-border text-muted-foreground mt-8 border-t px-6 py-6 text-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>{footerLabel}</p>
            <div className="flex gap-4">
              <Link href="/legales/terminos" className="hover:text-foreground">
                Términos
              </Link>
              <Link href="/contacto" className="hover:text-foreground">
                Soporte
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
