import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { steps } from "@/features/public-site/content/home";

export function HowItWorks() {
  return (
    <section id="qr" className="bg-muted py-20">
      <Container>
        <SectionHeading eyebrow="Cómo funciona" title="En 3 pasos" />

        <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
          {steps.map((item, index) => (
            <div key={item.title} className="relative text-center">
              <div className="bg-card text-brand-700 ring-border mx-auto flex size-16 items-center justify-center rounded-full shadow-sm ring-1">
                <item.icon className="size-7" />
              </div>
              <span className="text-brand-600 mt-4 block text-sm font-semibold">
                Paso {index + 1}
              </span>
              <h3 className="text-foreground mt-1 font-semibold">
                {item.title}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
