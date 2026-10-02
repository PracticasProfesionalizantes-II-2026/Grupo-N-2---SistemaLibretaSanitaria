import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<"input">
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "border-border bg-card text-foreground placeholder:text-muted-foreground/70 h-11 w-full rounded-lg border px-3.5 text-sm",
        "focus:border-brand-500 focus:ring-brand-500/20 focus:ring-2 focus:outline-none",
        "aria-invalid:border-danger aria-invalid:focus:ring-danger/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
