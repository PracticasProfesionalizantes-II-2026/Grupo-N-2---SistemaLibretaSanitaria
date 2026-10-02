import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const badgeStyles = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        brand: "bg-brand-50 text-brand-700",
        accent: "bg-accent-50 text-accent-700",
        neutral: "bg-muted text-muted-foreground",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
      },
    },
    defaultVariants: {
      variant: "brand",
    },
  },
);

type BadgeProps = VariantProps<typeof badgeStyles> &
  ComponentPropsWithoutRef<"span">;

export function Badge({ variant, className, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeStyles({ variant }), className)} {...props} />
  );
}
