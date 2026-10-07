import { PawPrint, ShieldCheck, Syringe } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { QrPlaceholder } from "@/components/ui/qr-placeholder";

export function Hero() {
  return (
    <section className="from-brand-50 to-background relative overflow-hidden bg-gradient-to-b">
      <Container className="grid grid-cols-1 items-center gap-16 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <h1 className="text-foreground text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            La libreta sanitaria de tu mascota,{" "}
            <span className="text-brand-600">siempre con vos</span>
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg">
            PetCloud reemplaza la libreta de papel por un registro digital
            único, centralizado y siempre accesible para dueños, veterinarias y
            municipios.
          </p>

          {/*
            El secundario era "Solicitar demo" y apuntaba a /contacto. Duplicaba
            la intención comercial para el público general —un dueño de mascota
            no pide una demo, se registra— y dejaba sin CTA a quien ya tiene
            cuenta, que es la mayoría del tráfico de una landing madura. La demo
            sigue viva donde corresponde: /para-veterinarias y /para-municipios
            tienen su propia sección, y ahí sí es la acción principal.
          */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/registro" size="lg">
              Crear cuenta gratis
            </ButtonLink>
            <ButtonLink href="/login" variant="outline" size="lg">
              Ingresar a mi cuenta
            </ButtonLink>
          </div>

          <p className="text-muted-foreground mt-5 text-sm font-medium">
            Gratis para dueños, veterinarias y municipios
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div className="bg-brand-200/50 absolute -inset-8 -z-10 rounded-full blur-3xl" />
          <div className="border-border bg-card rounded-2xl border p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="bg-brand-100 text-brand-700 flex size-12 items-center justify-center rounded-full">
                <PawPrint className="size-6" />
              </span>
              <div>
                <p className="text-foreground font-semibold">Firulais</p>
                <p className="text-muted-foreground text-sm">
                  Labrador · 3 años
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="bg-muted flex items-center justify-between rounded-lg px-4 py-3">
                <span className="text-foreground flex items-center gap-2 text-sm font-medium">
                  <Syringe className="text-brand-600 size-4" />
                  Antirrábica
                </span>
                <span className="text-success flex items-center gap-1 text-sm font-semibold">
                  <ShieldCheck className="size-4" />
                  Al día
                </span>
              </div>
              <div className="bg-muted flex items-center justify-between rounded-lg px-4 py-3">
                <span className="text-foreground text-sm font-medium">
                  Próximo control
                </span>
                <span className="text-muted-foreground text-sm">
                  15 sep 2026
                </span>
              </div>
            </div>

            <div className="border-border mt-6 flex items-center justify-center rounded-lg border border-dashed py-4">
              <QrPlaceholder className="size-16 p-0" />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
