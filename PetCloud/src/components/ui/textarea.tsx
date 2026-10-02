import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  ComponentPropsWithoutRef<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "border-border bg-card text-foreground placeholder:text-muted-foreground/70 min-h-24 w-full rounded-lg border px-3.5 py-2.5 text-sm",
        "focus:border-brand-500 focus:ring-brand-500/20 focus:ring-2 focus:outline-none",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
