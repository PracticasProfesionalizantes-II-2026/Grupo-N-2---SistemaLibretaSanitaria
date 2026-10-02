import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type Crumb = { label: string; href?: string };

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title?: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumbs?.length ? (
        <nav aria-label="Ruta de navegación" className="mb-3">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="size-3.5" /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {title || actions ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title ? (
              <h1 className="text-foreground text-2xl font-bold tracking-tight">
                {title}
              </h1>
            ) : null}
            {description ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex max-w-full min-w-0 flex-wrap gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
