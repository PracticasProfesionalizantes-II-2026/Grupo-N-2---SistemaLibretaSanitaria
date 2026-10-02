"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type TabItem = {
  label: string;
  href: string;
};

/**
 * Pestañas basadas en rutas: cada pestaña es una URL propia, así los deep links
 * de notificaciones y emails pueden abrir directamente la pestaña correcta.
 */
export function Tabs({ items }: { items: TabItem[] }) {
  const pathname = usePathname();

  return (
    <div className="border-border -mx-1 overflow-x-auto border-b">
      <nav className="flex min-w-max gap-1 px-1">
        {items.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "border-brand-600 text-brand-700"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
