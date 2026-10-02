"use client";

import { ChevronsLeft, Settings } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Avatar } from "@/components/ui/avatar";
import { VET_BASE } from "@/config/vet-nav";
import { VetNav } from "@/features/vet/components/shell/vet-nav";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import { cn } from "@/lib/utils";

export function VetSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const vet = useVetSession();
  const nombre = [vet?.usuario.nombre, vet?.usuario.apellido]
    .filter(Boolean)
    .join(" ");

  return (
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
            href={`${VET_BASE}/gestion`}
            className="bg-brand-600 flex size-9 items-center justify-center rounded-lg text-white"
            aria-label="PetCloud — Gestión"
          >
            <span className="text-sm font-bold">PC</span>
          </Link>
        ) : (
          <Logo href={`${VET_BASE}/gestion`} />
        )}
      </div>

      {collapsed ? null : (
        <div className="border-border border-b px-5 py-3">
          <p className="text-muted-foreground text-xs font-semibold uppercase">
            Institución
          </p>
          <p className="text-foreground mt-1 truncate text-sm font-medium">
            {vet?.institucion.nombre}
          </p>
        </div>
      )}

      <VetNav
        className="flex-1 space-y-1 overflow-y-auto p-3"
        collapsed={collapsed}
      />

      <div className="border-border border-t p-3">
        <Link
          href={`${VET_BASE}/configuracion`}
          className={cn(
            "hover:bg-muted flex items-center gap-3 rounded-lg p-2",
            collapsed && "justify-center",
          )}
          title={collapsed ? "Configuración" : undefined}
        >
          <Avatar name={nombre} size="sm" />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-medium">
                  {nombre}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {vet?.matricula}
                </span>
              </span>
              <Settings className="text-muted-foreground size-4 shrink-0" />
            </>
          )}
        </Link>

        <button
          type="button"
          onClick={onToggle}
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
  );
}
