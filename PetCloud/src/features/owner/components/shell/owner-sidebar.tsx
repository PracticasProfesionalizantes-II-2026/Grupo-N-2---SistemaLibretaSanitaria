"use client";

import { ChevronsLeft, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { Avatar } from "@/components/ui/avatar";
import { ownerNav } from "@/config/owner-nav";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { useSessionUser } from "@/features/auth/components/session-provider";
import { cn } from "@/lib/utils";

export function OwnerSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { activePet } = useActivePet();
  const user = useSessionUser();
  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(" ");

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
            href="/inicio"
            className="bg-brand-600 flex size-9 items-center justify-center rounded-lg text-white"
            aria-label="PetCloud — Inicio"
          >
            <span className="text-sm font-bold">PC</span>
          </Link>
        ) : (
          <Logo href="/inicio" />
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {ownerNav.map((item) => {
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
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-5 shrink-0" />
              {collapsed ? null : item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-border border-t p-3">
        <Link
          href="/configuracion"
          className={cn(
            "hover:bg-muted flex items-center gap-3 rounded-lg p-2",
            collapsed && "justify-center",
          )}
          title={collapsed ? "Configuración" : undefined}
        >
          <Avatar name={fullName} src={user?.avatarUrl} size="sm" />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-medium">
                  {fullName}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  Dueño de mascota
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
