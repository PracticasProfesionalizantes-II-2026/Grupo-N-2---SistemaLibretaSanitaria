"use client";

import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-foreground text-sm font-medium">
          {label}
        </label>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        ) : null}
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "focus-visible:ring-ring relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          checked ? "bg-brand-600" : "bg-border",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          className={cn(
            "inline-block size-[18px] rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
