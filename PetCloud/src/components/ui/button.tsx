import { type VariantProps, cva } from "class-variance-authority";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white hover:bg-brand-700",
        secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-7 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = VariantProps<typeof buttonStyles> & {
  className?: string;
};

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  href,
  ...props
}: ButtonProps & ComponentPropsWithoutRef<typeof Link> & { href: string }) {
  return (
    <Link
      href={href}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}
