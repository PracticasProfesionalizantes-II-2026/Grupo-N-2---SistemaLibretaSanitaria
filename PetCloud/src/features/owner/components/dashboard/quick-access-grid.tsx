import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export type QuickAccessItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export function QuickAccessGrid({
  title,
  items,
}: {
  title: string;
  items: QuickAccessItem[];
}) {
  return (
    <section>
      <h2 className="text-foreground mb-3 font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="border-border bg-card hover:border-brand-300 hover:bg-brand-50/50 flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-colors"
          >
            <span className="bg-brand-50 text-brand-700 flex size-11 items-center justify-center rounded-lg">
              <item.icon className="size-5" />
            </span>
            <span className="text-foreground text-sm font-medium">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
