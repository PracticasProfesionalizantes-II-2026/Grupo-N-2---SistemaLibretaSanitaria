"use client";

import { useSearchParams } from "next/navigation";

import { ContactForm } from "@/features/public-site/components/contact-form";
import type { ContactFormValues } from "@/features/public-site/schemas/contact-schema";

const VALID_TYPES = ["dueno", "veterinaria", "municipio"] as const;

/**
 * Envoltorio del formulario que lee `?tipo=` de la URL.
 *
 * El mapa de navegación pide que "Solicitar demo" abra Contacto con el tipo
 * preseleccionado; así el mismo link sirve desde el header, desde las landings
 * sectoriales y desde el banner corporativo.
 */
export function ContactPanel() {
  const searchParams = useSearchParams();
  const tipo = searchParams.get("tipo");

  const defaultTipo = VALID_TYPES.includes(tipo as (typeof VALID_TYPES)[number])
    ? (tipo as ContactFormValues["tipo"])
    : undefined;

  return <ContactForm defaultTipo={defaultTipo} />;
}
