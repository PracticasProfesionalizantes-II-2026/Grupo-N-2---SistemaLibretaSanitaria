import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type SelectableCardProps = ComponentPropsWithoutRef<"button"> & {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
};

export function SelectableCard({
  icon: Icon,
  title,
  description,
  selected,
  className,
  ...props
}: SelectableCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-colors",
        selected
          ? "border-brand-600 bg-brand-50 ring-brand-500/20 ring-2"
          : "border-border bg-card hover:border-brand-300",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-lg",
          selected
            ? "bg-brand-600 text-white"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-foreground font-semibold">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
    </button>
  );
}
