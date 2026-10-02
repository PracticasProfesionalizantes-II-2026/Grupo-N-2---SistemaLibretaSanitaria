import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { actors } from "@/features/public-site/content/home";

export function ForEachActor() {
  return (
    <section className="bg-muted py-20">
      <Container>
        <SectionHeading
          eyebrow="Para cada actor"
          title="Un mismo dato, tres formas de usarlo"
        />

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {actors.map((actor) => (
            <Link
              key={actor.title}
              href={actor.href}
              className="group border-border bg-card flex flex-col rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="bg-brand-50 text-brand-700 flex size-11 items-center justify-center rounded-lg">
                <actor.icon className="size-5" />
              </span>
              <h3 className="text-foreground mt-4 font-semibold">
                {actor.title}
              </h3>
              <p className="text-muted-foreground mt-2 flex-1 text-sm">
                {actor.description}
              </p>
              <span className="text-brand-600 mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                Conocer más
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
