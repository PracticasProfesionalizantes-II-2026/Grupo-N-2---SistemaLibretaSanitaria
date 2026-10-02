import { Accordion } from "@/components/ui/accordion";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { faqs } from "@/features/public-site/content/home";

export function FaqSection() {
  return (
    <section className="bg-muted py-20">
      <Container className="max-w-3xl">
        <SectionHeading eyebrow="Preguntas frecuentes" title="¿Tenés dudas?" />
        <div className="mt-12">
          <Accordion items={faqs} />
        </div>
      </Container>
    </section>
  );
}
