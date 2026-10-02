import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export function Table({
  className,
  ...props
}: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <table
        className={cn("w-full min-w-max border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function THead({
  className,
  ...props
}: ComponentPropsWithoutRef<"thead">) {
  return <thead className={cn("bg-muted", className)} {...props} />;
}

export function TH({ className, ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      className={cn(
        "text-muted-foreground px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({
  className,
  ...props
}: ComponentPropsWithoutRef<"tbody">) {
  return (
    <tbody className={cn("divide-border divide-y", className)} {...props} />
  );
}

export function TR({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return <tr className={cn("hover:bg-muted/60", className)} {...props} />;
}

export function TD({ className, ...props }: ComponentPropsWithoutRef<"td">) {
  return (
    <td
      className={cn("text-foreground px-4 py-3 align-middle", className)}
      {...props}
    />
  );
}
