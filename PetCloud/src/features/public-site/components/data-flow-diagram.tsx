import { Building2, PawPrint, Stethoscope } from "lucide-react";

/**
 * El circuito del dato entre los tres actores. Es el concepto central del
 * producto: el mismo registro sirve a tres personas que hoy no comparten
 * información.
 */
export function DataFlowDiagram() {
  const actors = [
    {
      icon: PawPrint,
      titulo: "Dueño",
      aporta: "Carga la mascota y sus datos básicos",
      recibe: "Historial completo y recordatorios",
    },
    {
      icon: Stethoscope,
      titulo: "Veterinario",
      aporta: "Carga consultas y vacunas firmadas",
      recibe: "Historial completo del paciente",
    },
    {
      icon: Building2,
      titulo: "Municipio",
      aporta: "Publica campañas de vacunación",
      recibe: "Padrón y cobertura por barrio",
    },
  ];

  return (
    <div className="border-border bg-card rounded-2xl border p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {actors.map((actor, index) => (
          <div key={actor.titulo} className="relative">
            {/* Conector entre columnas, solo en escritorio */}
            {index < actors.length - 1 ? (
              <span
                className="bg-border absolute top-7 -right-3 hidden h-px w-6 md:block"
                aria-hidden
              />
            ) : null}

            <div className="text-center">
              <span className="bg-brand-50 text-brand-700 mx-auto flex size-14 items-center justify-center rounded-full">
                <actor.icon className="size-6" />
              </span>
              <h3 className="text-foreground mt-3 font-bold">{actor.titulo}</h3>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="bg-muted rounded-lg p-3">
                <dt className="text-muted-foreground text-xs font-semibold uppercase">
                  Aporta
                </dt>
                <dd className="text-foreground mt-1">{actor.aporta}</dd>
              </div>
              <div className="bg-brand-50 rounded-lg p-3">
                <dt className="text-brand-700 text-xs font-semibold uppercase">
                  Recibe
                </dt>
                <dd className="text-foreground mt-1">{actor.recibe}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground border-border mt-8 border-t pt-6 text-center text-sm">
        El sistema rinde cuando hay veterinarias adheridas cargando datos: ese
        es el efecto de red que hace que el registro valga para los tres.
      </p>
    </div>
  );
}
