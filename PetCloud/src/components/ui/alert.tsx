import { type VariantProps, cva } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const alertStyles = cva(
  "flex items-start gap-3 rounded-lg border p-4 text-sm",
  {
    variants: {
      variant: {
        danger: "border-danger/25 bg-danger-soft text-danger",
        warning: "border-warning/25 bg-warning-soft text-warning",
        info: "border-info/25 bg-info-soft text-info",
        success: "border-success/25 bg-success-soft text-success",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const ICONS = {
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

type AlertProps = VariantProps<typeof alertStyles> &
  ComponentPropsWithoutRef<"div">;

export function Alert({
  variant = "info",
  className,
  children,
  ...props
}: AlertProps) {
  const Icon = ICONS[variant ?? "info"];

  return (
    <div className={cn(alertStyles({ variant }), className)} {...props}>
      <Icon className="mt-0.5 size-[18px] shrink-0" />
      <div>{children}</div>
    </div>
  );
}
