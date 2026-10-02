import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cn } from "@/lib/utils";

export const Select = forwardRef<
  HTMLSelectElement,
  ComponentPropsWithoutRef<"select">
>(({ className, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        "border-border bg-card text-foreground h-11 w-full rounded-lg border px-3 text-sm",
        "focus:border-brand-500 focus:ring-brand-500/20 focus:ring-2 focus:outline-none",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
});
Select.displayName = "Select";
