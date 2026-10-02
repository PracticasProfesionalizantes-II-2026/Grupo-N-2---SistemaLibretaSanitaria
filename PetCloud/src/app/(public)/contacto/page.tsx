import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { ContactPanel } from "@/features/public-site/components/contact-panel";
import { PageHero } from "@/features/public-site/components/page-hero";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Escribinos para pedir una demo de PetCloud o resolver dudas. Atendemos a dueños, veterinarias y municipios que quieran digitalizar su padrón.",
  // openGraph no hereda el `title` ni la `description` de esta misma
  // página: sin esto, la tarjeta al compartir muestra la del sitio.
  openGraph: {
    title: "Contacto · PetCloud",
    description:
      "Escribinos para pedir una demo de PetCloud o resolver dudas. Atendemos a dueños, veterinarias y municipios que quieran digitalizar su padrón.",
  },
};

const CHANNELS = [
  { icon: Mail, label: "Email", value: siteConfig.contact.email },
  { icon: Phone, label: "Teléfono", value: siteConfig.contact.phone },
  { icon: MapPin, label: "Ubicación", value: siteConfig.contact.location },
];

export default function ContactoPage() {
  return (
    <>
      <PageHero
        eyebrow="Contacto"
        title="Hablemos"
        description="Contanos qué necesitás y te respondemos dentro de las 48 horas hábiles. Si querés ver el panel funcionando, pedinos una demo."
      />

      <section className="pb-20">
        <Container>
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_22rem]">
            <Suspense>
              <ContactPanel />
            </Suspense>

            <div className="space-y-6">
              <Card className="p-6">
                <h2 className="text-foreground font-semibold">
                  Datos de contacto
                </h2>

                <ul className="mt-5 space-y-4">
                  {CHANNELS.map((channel) => (
                    <li key={channel.label} className="flex items-start gap-3">
                      <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
                        <channel.icon className="size-5" />
                      </span>
                      <div>
                        <p className="text-muted-foreground text-xs">
                          {channel.label}
                        </p>
                        <p className="text-foreground mt-0.5 text-sm font-medium">
                          {channel.value}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-6">
                <h2 className="text-foreground font-semibold">
                  Escribinos por WhatsApp
                </h2>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  Si preferís algo más rápido, mandanos un mensaje.
                </p>

                <a
                  href="https://wa.me/5491100000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-ring mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <MessageCircle className="size-4" />
                  Abrir WhatsApp
                </a>
              </Card>

              {/* Espacio reservado para el mapa */}
              <Card className="flex aspect-[4/3] items-center justify-center p-0">
                <div className="text-muted-foreground flex flex-col items-center gap-2">
                  <MapPin className="size-8" />
                  <p className="text-sm">{siteConfig.contact.location}</p>
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
