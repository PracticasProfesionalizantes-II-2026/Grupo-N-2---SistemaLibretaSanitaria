import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cn } from "@/lib/utils";

export const Checkbox = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<"input">
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "border-border accent-brand-600 focus:ring-brand-500/30 mt-0.5 size-4 shrink-0 rounded focus:ring-2",
        className,
      )}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";
