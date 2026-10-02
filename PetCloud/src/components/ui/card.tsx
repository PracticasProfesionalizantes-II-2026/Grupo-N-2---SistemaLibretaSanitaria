import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "border-border bg-card rounded-xl border p-6 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
