import { Compass, HeartHandshake, Target } from "lucide-react";
import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHero } from "@/features/public-site/components/page-hero";

export const metadata: Metadata = {
  title: "Nosotros",
  description:
    "Quiénes somos y por qué construimos PetCloud: un registro sanitario digital, gratuito y compartido entre dueños, veterinarias y municipios.",
  // openGraph no hereda el `title` ni la `description` de esta misma
  // página: sin esto, la tarjeta al compartir muestra la del sitio.
  openGraph: {
    title: "Nosotros · PetCloud",
    description:
      "Quiénes somos y por qué construimos PetCloud: un registro sanitario digital, gratuito y compartido entre dueños, veterinarias y municipios.",
  },
};

const PILLARS = [
  {
    icon: HeartHandshake,
    titulo: "Sobre nosotros",
    texto:
      "Somos un equipo que se cansó de ver la misma escena: una libreta de cartón mojada, con letra ilegible, que nadie sabe dónde quedó. Detrás de ese papelito hay un problema real de salud pública, porque sin registro no hay forma de saber qué porcentaje de la población animal está protegida contra la rabia. Construimos PetCloud para que ese dato exista, sea confiable y esté disponible para quien lo necesita.",
  },
  {
    icon: Target,
    titulo: "Misión",
    texto:
      "Reemplazar la libreta sanitaria de papel por un registro digital único, centralizado y siempre accesible, que sirva simultáneamente al dueño que quiere cuidar a su mascota, al veterinario que necesita el historial para atender bien, y al municipio que tiene que prevenir zoonosis. Y que sea gratuito, porque un registro sanitario al que solo acceden los que pueden pagarlo no cumple su función.",
  },
  {
    icon: Compass,
    titulo: "Visión",
    texto:
      "Que en unos años ninguna mascota dependa de un papel para tener historia clínica. Que cualquier veterinaria del país pueda escanear un QR y saber exactamente qué se le aplicó a ese animal, cuándo y quién lo firmó. Y que cada municipio tenga, sin operativos extraordinarios, el mapa de cobertura sanitaria de su ciudad.",
  },
];

const PRINCIPLES = [
  {
    titulo: "El dato es del dueño",
    texto:
      "La información de cada mascota le pertenece a su dueño. Él decide con quién la comparte y qué datos se ven en la ficha pública del QR; el nombre siempre está, y la historia clínica nunca.",
  },
  {
    titulo: "El municipio no ve la historia clínica",
    texto:
      "Accede al padrón y al estado de vacunación, nada más. Cada apertura de ficha queda auditada.",
  },
  {
    titulo: "Solo un profesional valida",
    texto:
      "Lo que carga el dueño queda marcado como no verificado hasta que un veterinario matriculado lo firma.",
  },
  {
    titulo: "El registro sanitario es gratis",
    texto:
      "Para dueños, veterinarias y municipios. Lo único pago es Premium, un módulo opcional de gestión para veterinarias: nunca se cobra el acceso al dato.",
  },
];

export default function NosotrosPage() {
  return (
    <>
      <PageHero
        eyebrow="Nosotros"
        title="Un papelito no debería ser la única historia clínica de un animal"
        description="PetCloud nace de un problema concreto y cotidiano: la información sanitaria de las mascotas está dispersa, se pierde, y por eso nadie —ni el dueño, ni el veterinario, ni el municipio— tiene el panorama completo."
      />

      <section className="py-20">
        <Container>
          <div className="space-y-12">
            {PILLARS.map((pillar, index) => (
              <div
                key={pillar.titulo}
                className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16"
              >
                <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
                  <span className="bg-brand-50 text-brand-700 flex size-12 items-center justify-center rounded-xl">
                    <pillar.icon className="size-6" />
                  </span>
                  <h2 className="text-foreground mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                    {pillar.titulo}
                  </h2>
                  <p className="text-muted-foreground mt-4">{pillar.texto}</p>
                </div>

                {/* Espacio reservado para la imagen de cada bloque */}
                <div
                  className={`border-border from-brand-50 to-muted flex aspect-[4/3] items-center justify-center rounded-2xl border bg-gradient-to-br ${
                    index % 2 === 1 ? "lg:order-1" : ""
                  }`}
                  aria-hidden
                >
                  <pillar.icon className="text-brand-300 size-20" />
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-muted py-20">
        <Container>
          <SectionHeading
            eyebrow="Cómo trabajamos"
            title="Los principios que no negociamos"
            description="Son decisiones de producto, y están escritas para que se nos pueda reclamar si no las cumplimos."
          />

          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <Card key={principle.titulo}>
                <h3 className="text-foreground font-semibold">
                  {principle.titulo}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  {principle.texto}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container className="text-center">
          <h2 className="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
            ¿Querés que hablemos?
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">
            Si sos veterinario, trabajás en un municipio o simplemente querés
            entender mejor el proyecto, escribinos.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/contacto" size="lg">
              Contactarnos
            </ButtonLink>
            <ButtonLink href="/registro" variant="outline" size="lg">
              Crear cuenta gratis
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
