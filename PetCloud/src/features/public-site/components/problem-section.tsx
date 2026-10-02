import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { problems } from "@/features/public-site/content/home";

export function ProblemSection() {
  return (
    <section className="py-20">
      <Container>
        <SectionHeading
          eyebrow="El problema"
          title="El control sanitario hoy vive en una libretita de cartón"
          description="Se pierde, se moja, se olvida en casa. Y nadie tiene la trazabilidad que hace falta."
        />

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {problems.map((item) => (
            <Card key={item.title}>
              <span className="bg-brand-50 text-brand-700 flex size-11 items-center justify-center rounded-lg">
                <item.icon className="size-5" />
              </span>
              <h3 className="text-foreground mt-4 font-semibold">
                {item.title}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm">
                {item.description}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
