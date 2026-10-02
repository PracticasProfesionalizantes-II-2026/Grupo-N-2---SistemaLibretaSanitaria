"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef, useState } from "react";

import { cn } from "@/lib/utils";

export const PasswordInput = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<"input">
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn(
          "border-border bg-card text-foreground placeholder:text-muted-foreground/70 h-11 w-full rounded-lg border px-3.5 pr-11 text-sm",
          "focus:border-brand-500 focus:ring-brand-500/20 focus:ring-2 focus:outline-none",
          "aria-invalid:border-danger aria-invalid:focus:ring-danger/20",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        tabIndex={-1}
      >
        {visible ? (
          <EyeOff className="size-[18px]" />
        ) : (
          <Eye className="size-[18px]" />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
