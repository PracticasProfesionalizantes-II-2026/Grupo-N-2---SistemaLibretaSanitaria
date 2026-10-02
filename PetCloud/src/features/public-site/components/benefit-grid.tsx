import { Card } from "@/components/ui/card";
import type { Benefit } from "@/features/public-site/content/segments";

export function BenefitGrid({ benefits }: { benefits: Benefit[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {benefits.map((benefit) => (
        <Card key={benefit.titulo}>
          <span className="bg-brand-50 text-brand-700 flex size-11 items-center justify-center rounded-lg">
            <benefit.icon className="size-5" />
          </span>
          <h3 className="text-foreground mt-4 font-semibold">
            {benefit.titulo}
          </h3>
          <p className="text-muted-foreground mt-2 text-sm">{benefit.texto}</p>
        </Card>
      ))}
    </div>
  );
}
