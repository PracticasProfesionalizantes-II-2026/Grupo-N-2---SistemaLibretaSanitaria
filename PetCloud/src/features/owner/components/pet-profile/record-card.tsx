import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

export function RecordCard({
  title,
  badges,
  status,
  dates,
  secondary,
  actions,
}: {
  title: ReactNode;
  badges?: ReactNode;
  status?: ReactNode;
  dates: { label: string; value: ReactNode }[];
  secondary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-foreground font-medium break-words">{title}</p>
      {badges || status ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {badges}
          {status}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        {dates.map((date) => (
          <div key={date.label}>
            <p className="text-muted-foreground text-xs">{date.label}</p>
            <p className="text-foreground text-sm">{date.value}</p>
          </div>
        ))}
      </div>

      {secondary ? (
        <div className="text-muted-foreground mt-3 space-y-1 text-sm">
          {secondary}
        </div>
      ) : null}

      {actions ? <div className="mt-4 w-full">{actions}</div> : null}
    </Card>
  );
}
