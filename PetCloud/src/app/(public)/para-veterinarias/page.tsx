import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { BenefitGrid } from "@/features/public-site/components/benefit-grid";
import { ContactForm } from "@/features/public-site/components/contact-form";
import { FeatureChecklist } from "@/features/public-site/components/feature-checklist";
import { PageHero } from "@/features/public-site/components/page-hero";
import { PanelMockup } from "@/features/public-site/components/panel-mockup";
import {
  vetBenefits,
  vetFeatures,
  vetPremiumFeatures,
  vetSteps,
} from "@/features/public-site/content/segments";

export const metadata: Metadata = {
  title: "Para veterinarias",
  description:
    "PetCloud para veterinarias: escaneá el QR, accedé al historial completo del paciente y cargá consultas y vacunaciones con tu firma digital. Panel clínico gratis.",
  // openGraph no hereda el `title` ni la `description` de esta misma
  // página: sin esto, la tarjeta al compartir muestra la del sitio.
  openGraph: {
    title: "Para veterinarias · PetCloud",
    description:
      "PetCloud para veterinarias: escaneá el QR, accedé al historial completo del paciente y cargá consultas y vacunaciones con tu firma digital. Panel clínico gratis.",
  },
};

export default function ParaVeterinariasPage() {
  return (
    <>
      <PageHero
        eyebrow="Para veterinarias"
        title="El historial completo del paciente, antes de tocarlo"
        description="Escaneás el QR y ves todo: qué vacunas tiene, qué le recetó el colega que lo atendió el mes pasado, a qué es alérgico. Sin llamados, sin libretas ilegibles, sin empezar de cero."
        actions={
          <>
            <ButtonLink href="#demo" size="lg">
              Solicitar demo
            </ButtonLink>
            <ButtonLink href="/como-funciona" variant="outline" size="lg">
              Ver cómo funciona
            </ButtonLink>
          </>
        }
      />

      <section className="py-20">
        <Container>
          <SectionHeading
            eyebrow="Beneficios"
            title="Qué cambia en tu consultorio"
          />
          <div className="mt-14">
            <BenefitGrid benefits={vetBenefits} />
          </div>
        </Container>
      </section>

      <section className="bg-muted py-20">
        <Container>
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
                El panel
              </p>
              <h2 className="text-foreground mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Qué incluye
              </h2>
              <p className="text-muted-foreground mt-4">
                Todo lo clínico del día a día del consultorio viene incluido y
                no tiene costo.
              </p>

              <h3 className="text-foreground mt-8 font-semibold">
                Incluido gratis
              </h3>
              <div className="mt-4">
                <FeatureChecklist features={vetFeatures} />
              </div>

              <h3 className="text-foreground mt-10 font-semibold">
                Con Premium
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Plan opcional para gestionar la veterinaria. Si lo das de baja,
                tus datos clínicos siguen intactos.
              </p>
              <div className="mt-4">
                <FeatureChecklist features={vetPremiumFeatures} />
              </div>
            </div>

            <PanelMockup
              title="Ficha del paciente"
              sidebarItems={[
                "Gestión",
                "Escanear QR",
                "Pacientes",
                "Sala de espera",
                "Vacunaciones",
                "Institución",
              ]}
            />
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <SectionHeading
            eyebrow="Puesta en marcha"
            title="De la demo al primer paciente"
            description="Sin instalación, sin migración de datos, sin costo."
          />

          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {vetSteps.map((step) => (
              <div key={step.numero}>
                <span className="bg-brand-600 flex size-10 items-center justify-center rounded-full font-bold text-white">
                  {step.numero}
                </span>
                <h3 className="text-foreground mt-4 font-semibold">
                  {step.titulo}
                </h3>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  {step.texto}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section id="demo" className="bg-muted py-20">
        <Container className="max-w-2xl">
          <SectionHeading
            eyebrow="Solicitar demo"
            title="Coordinemos una recorrida por el panel"
            description="Dejanos tus datos y te contactamos para mostrarte cómo funciona en tu consultorio."
          />

          <div className="mt-12">
            <ContactForm
              defaultTipo="veterinaria"
              variant="corto"
              organizacionLabel="Veterinaria"
            />
          </div>
        </Container>
      </section>
    </>
  );
}
