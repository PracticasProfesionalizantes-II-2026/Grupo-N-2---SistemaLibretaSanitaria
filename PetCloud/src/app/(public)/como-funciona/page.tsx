import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { QrPlaceholder } from "@/components/ui/qr-placeholder";
import { SectionHeading } from "@/components/ui/section-heading";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { DataFlowDiagram } from "@/features/public-site/components/data-flow-diagram";
import { PageHero } from "@/features/public-site/components/page-hero";
import {
  dataAccessRules,
  ownerBenefits,
  stages,
} from "@/features/public-site/content/how-it-works";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "El recorrido completo del dato en PetCloud: cómo se conectan el dueño, el veterinario y el municipio alrededor de una misma libreta sanitaria digital.",
  // openGraph no hereda el `title` ni la `description` de esta misma
  // página: sin esto, la tarjeta al compartir muestra la del sitio.
  openGraph: {
    title: "Cómo funciona · PetCloud",
    description:
      "El recorrido completo del dato en PetCloud: cómo se conectan el dueño, el veterinario y el municipio alrededor de una misma libreta sanitaria digital.",
  },
};

export default function ComoFuncionaPage() {
  return (
    <>
      <PageHero
        eyebrow="Cómo funciona"
        title="Una libreta, tres actores, un mismo dato"
        description="PetCloud no es una app de notas para el dueño. Es que el mismo registro sirva simultáneamente al dueño, al veterinario y al municipio, que hoy no comparten información."
        actions={
          <>
            <ButtonLink href="/registro" size="lg">
              Crear cuenta gratis
            </ButtonLink>
            <ButtonLink href="/contacto" variant="outline" size="lg">
              Solicitar demo
            </ButtonLink>
          </>
        }
      />

      <section className="py-20">
        <Container>
          <SectionHeading
            eyebrow="El circuito"
            title="Cómo circula la información"
            description="Cada actor aporta un dato y recibe otro. Nadie carga dos veces lo mismo."
          />
          <div className="mt-14">
            <DataFlowDiagram />
          </div>
        </Container>
      </section>

      <section className="bg-muted py-20">
        <Container>
          <SectionHeading
            eyebrow="Paso a paso"
            title="El recorrido completo"
            description="Desde que cargás a tu mascota hasta que el municipio ve la cobertura de vacunación de su ciudad."
          />

          <ol className="relative mt-14 space-y-8 pl-8 sm:pl-10">
            <span
              className="bg-border absolute top-3 bottom-3 left-[11px] w-px sm:left-[15px]"
              aria-hidden
            />

            {stages.map((stage) => (
              <li key={stage.numero} className="relative">
                <span
                  className="bg-brand-600 ring-muted absolute top-5 -left-8 size-6 rounded-full ring-4 sm:-left-10 sm:size-8"
                  aria-hidden
                />

                <Card className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <span className="bg-brand-50 text-brand-700 flex size-11 shrink-0 items-center justify-center rounded-lg">
                        <stage.icon className="size-5" />
                      </span>
                      <div>
                        <p className="text-muted-foreground text-xs font-semibold">
                          Paso {stage.numero}
                        </p>
                        <h3 className="text-foreground mt-0.5 font-bold">
                          {stage.titulo}
                        </h3>
                      </div>
                    </div>
                    <Badge variant="neutral">{stage.actor}</Badge>
                  </div>

                  <p className="text-muted-foreground mt-4 text-sm sm:pl-15">
                    {stage.descripcion}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="qr" className="py-20">
        <Container>
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
                El QR
              </p>
              <h2 className="text-foreground mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                La llave de todo el sistema
              </h2>
              <p className="text-muted-foreground mt-4 text-lg">
                Cada mascota tiene un código único. Es el atajo del veterinario
                y el seguro del dueño si la mascota se pierde.
              </p>

              <ul className="mt-8 space-y-4">
                {ownerBenefits.map((benefit) => (
                  <li key={benefit.titulo} className="flex gap-4">
                    <span className="bg-brand-50 text-brand-700 flex size-11 shrink-0 items-center justify-center rounded-lg">
                      <benefit.icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-foreground font-semibold">
                        {benefit.titulo}
                      </h3>
                      <p className="text-muted-foreground mt-0.5 text-sm">
                        {benefit.texto}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mx-auto w-full max-w-sm">
              <Card className="p-8">
                <div className="border-border mx-auto w-48 rounded-xl border p-3">
                  <QrPlaceholder />
                </div>
                <p className="text-muted-foreground mt-5 text-center font-mono text-sm">
                  PC-8F3A-2K9D
                </p>
                <p className="text-muted-foreground mt-4 text-center text-sm">
                  Escaneado con cualquier cámara muestra la ficha reducida.
                  Desde el panel de la veterinaria, el historial completo.
                </p>
              </Card>
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-muted py-20">
        <Container>
          <SectionHeading
            eyebrow="Privacidad"
            title="Quién ve qué"
            description="El historial clínico no es público, y el municipio nunca accede al detalle médico."
          />

          <div className="mt-14">
            <Table>
              <THead>
                <tr>
                  <TH>Quién</TH>
                  <TH>A qué accede</TH>
                  <TH>Detalle</TH>
                </tr>
              </THead>
              <TBody>
                {dataAccessRules.map((rule) => (
                  <TR key={rule.actor}>
                    <TD className="font-medium">{rule.actor}</TD>
                    <TD className="text-foreground">{rule.acceso}</TD>
                    <TD className="text-muted-foreground max-w-md whitespace-normal">
                      {rule.detalle}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container className="text-center">
          <h2 className="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
            Empezá hoy, es gratis
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">
            Cargá tu primera mascota en menos de dos minutos. Si representás a
            una veterinaria o un municipio, escribinos y coordinamos una demo.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/registro" size="lg">
              Crear cuenta gratis
            </ButtonLink>
            <ButtonLink href="/contacto" variant="outline" size="lg">
              Solicitar demo
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
