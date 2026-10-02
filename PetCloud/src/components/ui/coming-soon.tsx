import { Construction } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <span className="bg-brand-50 text-brand-700 flex size-14 items-center justify-center rounded-full">
        <Construction className="size-6" />
      </span>
      <h1 className="text-foreground mt-6 text-2xl font-bold sm:text-3xl">
        {title}
      </h1>
      <p className="text-muted-foreground mt-3 max-w-md">
        {description ??
          "Esta sección se construye en la próxima etapa del desarrollo."}
      </p>
      <ButtonLink href="/" variant="outline" className="mt-8">
        Volver al inicio
      </ButtonLink>
    </Container>
  );
}
