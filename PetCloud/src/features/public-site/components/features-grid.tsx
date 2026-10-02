import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { features } from "@/features/public-site/content/home";

export function FeaturesGrid() {
  return (
    <section className="py-20">
      <Container>
        <SectionHeading
          eyebrow="Funcionalidades"
          title="Todo lo que necesita la libreta sanitaria de tu mascota"
        />

        <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item) => (
            <div key={item.title} className="flex gap-4">
              <span className="bg-brand-50 text-brand-700 flex size-11 shrink-0 items-center justify-center rounded-lg">
                <item.icon className="size-5" />
              </span>
              <div>
                <h3 className="text-foreground font-semibold">{item.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
