"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { publicNav } from "@/config/site";
import { cn } from "@/lib/utils";

import { Logo } from "./logo";

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="border-border bg-background/90 sticky top-0 z-50 border-b backdrop-blur">
      <Container className="flex h-20 items-center justify-between">
        <Logo />

        <nav className="hidden items-center gap-8 xl:flex">
          {publicNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "text-brand-700"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/*
          El primario era "Solicitar demo" hacia /contacto?tipo=veterinaria: una
          acción B2B en la barra que ve TODO el tráfico, incluido el dueño de
          mascota que vino a registrarse. Ahora el primario es el alta y el
          secundario es entrar, que son las dos únicas cosas que alguien quiere
          hacer desde cualquier página del sitio. La demo vive en
          /para-veterinarias y /para-municipios, donde el visitante ya declaró
          que es una organización.

          Mismo texto que el hero ("Ingresar a mi cuenta") y no "Iniciar
          sesión": dos nombres para la misma acción en la misma pantalla hacen
          dudar de si llevan al mismo lado.
        */}
        <div className="hidden items-center gap-3 xl:flex">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Ingresar a mi cuenta
          </ButtonLink>
          <ButtonLink href="/registro" variant="primary" size="sm">
            Crear cuenta gratis
          </ButtonLink>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-foreground flex size-10 items-center justify-center rounded-lg xl:hidden"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </Container>

      <div
        className={cn(
          "border-border bg-background border-t xl:hidden",
          open ? "block" : "hidden",
        )}
      >
        <Container className="flex flex-col gap-1 py-4">
          {publicNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "hover:bg-muted rounded-lg px-3 py-2.5 text-sm font-medium",
                isActive(item.href) ? "text-brand-700" : "text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
          <div className="border-border mt-2 flex flex-col gap-2 border-t pt-4">
            <ButtonLink href="/login" variant="outline" size="md">
              Ingresar a mi cuenta
            </ButtonLink>
            <ButtonLink href="/registro" variant="primary" size="md">
              Crear cuenta gratis
            </ButtonLink>
          </div>
        </Container>
      </div>
    </header>
  );
}
