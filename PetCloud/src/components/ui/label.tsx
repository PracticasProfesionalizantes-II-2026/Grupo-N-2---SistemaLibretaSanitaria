import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: ComponentPropsWithoutRef<"label">) {
  return (
    <label
      className={cn(
        "text-foreground mb-1.5 block text-sm font-medium",
        className,
      )}
      {...props}
    />
  );
}
