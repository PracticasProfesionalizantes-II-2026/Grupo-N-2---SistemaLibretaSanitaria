"use client";

import { QrCode, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/layout/logo";
import { VET_BASE } from "@/config/vet-nav";
import { VetNav } from "@/features/vet/components/shell/vet-nav";
import { VetSessionProvider } from "@/features/vet/components/shell/vet-session-provider";
import { VetSidebar } from "@/features/vet/components/shell/vet-sidebar";
import { VetTopbar } from "@/features/vet/components/shell/vet-topbar";
import type { VetSession } from "@/features/vet/lib/vet-session";
import { cn } from "@/lib/utils";

export function VetShell({
  session,
  children,
}: {
  session: VetSession | null;
  children: React.ReactNode;
}) {
  return (
    <VetSessionProvider session={session}>
      <VetShellInner>{children}</VetShellInner>
    </VetSessionProvider>
  );
}

function VetShellInner({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const escanearHref = `${VET_BASE}/escanear`;

  return (
    <div className="bg-background min-h-svh">
      <VetSidebar
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
              <Logo href={`${VET_BASE}/gestion`} />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="text-muted-foreground hover:bg-muted flex size-8 items-center justify-center rounded-lg"
                aria-label="Cerrar menú"
              >
                <X className="size-5" />
              </button>
            </div>
            <VetNav
              className="flex-1 space-y-1 overflow-y-auto p-3"
              onNavigate={() => setMobileNavOpen(false)}
            />
          </aside>
        </>
      ) : null}

      <div
        className={cn(
          "transition-[padding]",
          collapsed ? "lg:pl-20" : "lg:pl-64",
        )}
      >
        <VetTopbar onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="p-4 sm:p-6">{children}</main>

        {/* En el celular la topbar no tiene lugar para "Escanear QR", y es la
            acción más usada en el mostrador: va como botón flotante. No tapa
            ninguna barra fija (el panel no tiene), y el footer deja aire debajo
            del último botón de cada pantalla. En la propia pantalla de escaneo
            sobra. */}
        {pathname !== escanearHref ? (
          <Link
            href={escanearHref}
            aria-label="Escanear QR"
            className="bg-brand-600 hover:bg-brand-700 fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full text-white shadow-lg sm:hidden"
          >
            <QrCode className="size-6" aria-hidden />
          </Link>
        ) : null}

        <footer className="border-border text-muted-foreground mt-8 border-t px-6 py-6 text-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>PetCloud v0.1.0 · Panel veterinario</p>
            <div className="flex gap-4">
              <Link href="/legales/terminos" className="hover:text-foreground">
                Términos
              </Link>
              <Link
                href="/contacto?tipo=veterinaria"
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
