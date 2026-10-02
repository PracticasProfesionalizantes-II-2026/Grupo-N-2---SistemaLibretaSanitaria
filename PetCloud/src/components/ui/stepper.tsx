import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isDone = stepNumber < current;
        const isCurrent = stepNumber === current;

        const isLast = stepNumber === steps.length;

        return (
          <li
            key={step}
            className={cn(
              "flex min-w-0 items-center gap-2 sm:gap-3",
              !isLast && "flex-1",
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isDone && "bg-brand-600 text-white",
                  isCurrent && "bg-brand-600 text-white",
                  !isDone && !isCurrent && "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-3.5" /> : stepNumber}
              </span>
              <span
                className={cn(
                  "hidden max-w-22 min-w-0 truncate text-sm font-medium sm:inline",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step}
              </span>
            </div>
            {isLast ? null : (
              <span
                className={cn(
                  "h-px min-w-6 flex-1",
                  isDone ? "bg-brand-600" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
