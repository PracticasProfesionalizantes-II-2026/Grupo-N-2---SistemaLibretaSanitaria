"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/layout/logo";
import { ownerNav } from "@/config/owner-nav";
import {
  SessionProvider,
  type SessionUser,
} from "@/features/auth/components/session-provider";
import type { Pet } from "@/types/pet";
import {
  ActivePetProvider,
  useActivePet,
} from "@/features/owner/components/active-pet-provider";
import { NewPetDialogProvider } from "@/features/owner/components/pets/new-pet-dialog-provider";
import { OwnerSidebar } from "@/features/owner/components/shell/owner-sidebar";
import { OwnerTopbar } from "@/features/owner/components/shell/owner-topbar";
import { cn } from "@/lib/utils";

export function OwnerShell({
  pets,
  user,
  children,
}: {
  pets: Pet[];
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider user={user}>
      <ActivePetProvider pets={pets}>
        {/*
          Envuelve al shell entero, no solo al contenido: el "Agregar
          mascota" del selector del topbar también tiene que poder abrirlo.
        */}
        <NewPetDialogProvider>
          <OwnerShellInner>{children}</OwnerShellInner>
        </NewPetDialogProvider>
      </ActivePetProvider>
    </SessionProvider>
  );
}

function OwnerShellInner({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const { activePet } = useActivePet();

  return (
    <div className="bg-background min-h-svh">
      <OwnerSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />

      {mobileNavOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <aside className="border-border bg-card fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r lg:hidden">
            <div className="border-border flex h-20 items-center justify-between border-b px-5">
              <Logo href="/inicio" />
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
              {ownerNav.map((item) => {
                // "Salud" apunta a la mascota activa; sin ninguna cargada, al
                // listado, que es donde está el botón para crear la primera.
                const href =
                  item.href === "salud"
                    ? activePet
                      ? `/mascotas/${activePet.id}`
                      : "/mis-mascotas"
                    : item.href;
                const isActive =
                  item.href === "salud"
                    ? pathname.startsWith("/mascotas/")
                    : pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <Link
                    key={item.label}
                    href={href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-5" />
                    {item.label}
                  </Link>
                );
              })}
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
        <OwnerTopbar onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="p-4 sm:p-6">{children}</main>

        <footer className="border-border text-muted-foreground mt-8 border-t px-6 py-6 text-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>PetCloud v0.1.0</p>
            <div className="flex gap-4">
              <Link href="/legales/terminos" className="hover:text-foreground">
                Términos
              </Link>
              <Link
                href="/configuracion/ayuda"
                className="hover:text-foreground"
              >
                Soporte
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
