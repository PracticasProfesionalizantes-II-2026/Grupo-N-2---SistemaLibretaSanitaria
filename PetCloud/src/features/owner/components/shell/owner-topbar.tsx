"use client";

import {
  ChevronDown,
  CircleHelp,
  LogOut,
  Menu,
  Settings,
  User,
} from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { OwnerSearchBox } from "@/features/owner/components/shell/owner-search-box";
import { PetSelector } from "@/features/owner/components/shell/pet-selector";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useSessionUser } from "@/features/auth/components/session-provider";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/features/auth/lib/use-sign-out";

export function OwnerTopbar({
  onOpenMobileNav,
}: {
  onOpenMobileNav: () => void;
}) {
  const user = useSessionUser();
  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(" ");
  const { signOut } = useSignOut();

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

        <PetSelector />

        <OwnerSearchBox />

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />

          <Dropdown
            triggerLabel={
              fullName
                ? `Menú de la cuenta de ${fullName}`
                : "Menú de la cuenta"
            }
            trigger={(open) => (
              <span className="hover:bg-muted flex items-center gap-2 rounded-lg p-1.5">
                <Avatar name={fullName} src={user?.avatarUrl} size="sm" />
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
                    {fullName}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {user?.email}
                  </p>
                </div>

                <Link
                  href="/perfil"
                  onClick={close}
                  className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                >
                  <User className="size-4" />
                  Perfil
                </Link>
                <Link
                  href="/configuracion"
                  onClick={close}
                  className="text-foreground hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                >
                  <Settings className="size-4" />
                  Configuración
                </Link>
                <Link
                  href="/configuracion/ayuda"
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
