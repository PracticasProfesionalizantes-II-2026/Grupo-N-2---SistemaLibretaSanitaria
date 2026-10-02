import type { ReactNode } from "react";

/** Una sección numerada de un documento legal (términos, privacidad, cookies). */
export function LegalSection({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-foreground text-xl font-bold tracking-tight">
        {numero}. {titulo}
      </h2>
      <div className="text-muted-foreground mt-3 space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}
