import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";

/**
 * Tarjeta de métrica. Un número grande con su etiqueta: cuando el dato es un
 * solo valor actual, esto se lee mejor que un gráfico de una sola barra.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  href: string;
}) {
  return (
    // El nombre accesible es etiqueta y valor: sin esto, el lector lee de corrido
    // etiqueta, número y pista, y el "—" de un dato vacío no se entiende.
    <Link
      href={href}
      aria-label={`${label}: ${value === "—" ? "sin datos" : value}`}
      className="block"
    >
      <Card className="hover:border-brand-300 h-full p-5 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <p className="text-muted-foreground text-sm font-medium">{label}</p>
          <span className="bg-brand-50 text-brand-700 flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
        <p className="text-foreground mt-3 text-3xl font-bold tracking-tight">
          {value}
        </p>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
        ) : null}
      </Card>
    </Link>
  );
}
