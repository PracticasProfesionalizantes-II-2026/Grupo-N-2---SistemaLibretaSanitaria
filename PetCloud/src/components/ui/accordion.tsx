import { ChevronDown } from "lucide-react";

export type AccordionItem = {
  question: string;
  answer: string;
};

export function Accordion({ items }: { items: AccordionItem[] }) {
  return (
    <div className="divide-border border-border bg-card divide-y rounded-xl border">
      {items.map((item) => (
        <details key={item.question} className="group p-6">
          <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:content-none">
            {item.question}
            <ChevronDown className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <p className="text-muted-foreground mt-3">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
