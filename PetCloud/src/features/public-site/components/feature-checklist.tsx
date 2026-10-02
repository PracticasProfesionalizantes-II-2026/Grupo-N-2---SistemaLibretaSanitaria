import { Check } from "lucide-react";

export function FeatureChecklist({ features }: { features: string[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-3">
          <span className="bg-brand-50 text-brand-700 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="text-foreground text-sm">{feature}</span>
        </li>
      ))}
    </ul>
  );
}
