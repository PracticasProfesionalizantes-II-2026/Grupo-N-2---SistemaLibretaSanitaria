import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";

/** Hero de las páginas internas del sitio público (no la Home). */
export function PageHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="from-brand-50 to-background bg-gradient-to-b">
      <Container className="py-16 lg:py-24">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-foreground mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="text-muted-foreground mt-5 text-lg">{description}</p>
          {actions ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {actions}
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
