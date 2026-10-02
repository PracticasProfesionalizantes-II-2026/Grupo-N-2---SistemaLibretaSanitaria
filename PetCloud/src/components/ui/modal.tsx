"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { Portal } from "@/components/ui/portal";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
};

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

/**
 * Modal accesible. Por regla de navegación del proyecto los modales no cambian
 * la URL: se abren sobre la pantalla actual y al cerrarlos se vuelve al estado
 * anterior.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "border-border bg-card relative my-8 w-full rounded-xl border shadow-xl",
            SIZES[size],
          )}
        >
          <div className="border-border flex items-start justify-between gap-4 border-b p-5">
            <div>
              <h2 className="text-foreground text-lg font-bold">{title}</h2>
              {description ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:bg-muted hover:text-foreground -mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="p-5">{children}</div>

          {footer ? (
            <div className="border-border flex justify-end gap-3 border-t p-5">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
