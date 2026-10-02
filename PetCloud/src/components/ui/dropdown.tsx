"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Menú desplegable genérico. `trigger` recibe el estado abierto para poder
 * rotar chevrons o cambiar estilos.
 */
export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
  panelClassName,
  triggerLabel,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
  /** Nombre accesible del botón, para cuando el `trigger` es solo iconos. */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        className="block w-full"
      >
        {trigger(open)}
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "border-border bg-card absolute z-50 mt-2 min-w-56 rounded-xl border p-1.5 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm",
        className,
      )}
      {...props}
    />
  );
}
