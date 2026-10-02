import { Building2 } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function CorporateBanner() {
  return (
    <section className="py-20">
      <Container>
        <div className="bg-brand-surface relative overflow-hidden rounded-2xl px-8 py-16 text-center sm:px-16">
          <Building2 className="absolute -top-8 -right-8 size-48 text-white/10" />
          <Building2 className="absolute -bottom-10 -left-10 size-56 text-white/[0.07]" />

          <div className="relative">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              ¿Trabajás en una veterinaria o un municipio?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/80">
              Sumate a PetCloud y empezá a construir, junto a tu comunidad, un
              registro sanitario confiable y siempre actualizado.
            </p>
            <ButtonLink
              href="/contacto"
              size="lg"
              className="text-brand-surface mt-8 bg-white hover:bg-white/90"
            >
              Hablar con nosotros
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
