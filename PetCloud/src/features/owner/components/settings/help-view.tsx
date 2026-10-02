import { FileText, Mail } from "lucide-react";
import Link from "next/link";

import { Accordion } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/config/site";
import { faqs } from "@/features/public-site/content/home";

/**
 * Ayuda del dueño.
 *
 * Las preguntas frecuentes son las mismas del sitio público: se importan, no se
 * copian. Si mañana cambia una respuesta, cambia en los dos lados.
 *
 * Los canales de contacto son deliberadamente pocos, porque son los únicos que
 * de verdad llegan a una persona:
 *
 * - El formulario público de `/contacto` NO se enlaza acá: hoy simula el envío
 *   (`contact-form.tsx` espera 700 ms y muestra "Recibimos tu mensaje") y no
 *   escribe en ninguna tabla. Mandar ahí a alguien que necesita soporte es
 *   prometerle una respuesta que nunca va a llegar.
 * - Tampoco hay teléfono ni WhatsApp: el número de `siteConfig` es un
 *   placeholder (`+54 9 11 0000-0000`). Cuando haya una línea real, el botón
 *   de WhatsApp va acá abajo, junto al correo.
 */
const ASUNTO_SOPORTE = encodeURIComponent("Soporte PetCloud");

export function HelpView() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Ayuda y soporte"
        description="Las dudas más comunes, y cómo escribirnos si quedó alguna sin responder."
      />

      <div className="space-y-6">
        <section>
          <h2 className="text-foreground mb-3 font-semibold">
            Preguntas frecuentes
          </h2>
          <Accordion items={faqs} />
        </section>

        <Card className="p-5">
          <h2 className="text-foreground font-semibold">¿Seguís con dudas?</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Escribinos por correo y te respondemos ahí mismo. Contanos qué
            estabas haciendo y, si podés, el nombre de tu mascota: nos ahorra
            una vuelta de preguntas.
          </p>

          <div className="mt-4 space-y-3">
            <a
              href={`mailto:${siteConfig.contact.email}?subject=${ASUNTO_SOPORTE}`}
              className="border-border hover:bg-muted -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm"
            >
              <Mail className="text-muted-foreground size-4 shrink-0" />
              <span className="text-foreground min-w-0">
                <span className="block font-medium">
                  Escribirnos por correo
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {siteConfig.contact.email}
                </span>
              </span>
            </a>

            <Link
              href="/legales/terminos"
              className="hover:bg-muted -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm"
            >
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <span className="text-foreground font-medium">
                Términos de uso
              </span>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
