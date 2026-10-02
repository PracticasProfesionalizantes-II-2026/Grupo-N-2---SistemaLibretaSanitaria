import { PenLine } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import type { MotivoSinFirma } from "@/features/vet/lib/puede-firmar";

/**
 * Estado de la firma digital de quien está cargando la atención.
 *
 * Firmar pide dos cosas, y hasta la `065` se mostraba solo una. La matrícula
 * validada se espera; la firma cargada se resuelve en dos minutos entrando a
 * Ajustes. Por eso acá hay dos avisos distintos y no un "no podés firmar":
 * cada uno dice qué hacer, y mandar a alguien a Ajustes cuando lo que falta es
 * la validación de la matrícula es mandarlo al lugar equivocado.
 *
 * Lo que se muestra acá es una cortesía, no un control: la regla la hacen
 * cumplir los triggers de la base (`enforce_signature_requires_license`,
 * `protect_vaccination_verification`, `enforce_certificate_requires_signature`).
 * Sirve para que la persona lo sepa **antes** de escribir la consulta entera,
 * no después.
 */
export function SignatureStatus({ motivo }: { motivo: MotivoSinFirma }) {
  if (motivo === "sin-matricula") {
    return (
      <Alert variant="warning">
        <strong>Tu matrícula está en validación.</strong> Podés cargar la
        atención y guardarla como borrador, pero no firmarla todavía. Cuando
        PetCloud confirme tus datos con el colegio profesional vas a poder
        firmar este registro y publicarlo en la libreta del dueño.
      </Alert>
    );
  }

  if (motivo === "sin-firma") {
    return (
      <Alert variant="warning">
        <strong>Todavía no cargaste tu firma.</strong> Cargala en Ajustes y vas
        a poder firmar. Mientras tanto, guardá el borrador: lo escrito no se
        pierde y se firma después, sin volver a cargarlo.
      </Alert>
    );
  }

  return (
    <Alert variant="success">
      <span className="flex items-center gap-2">
        <PenLine className="size-4 shrink-0" />
        Matrícula validada: al firmar, la consulta se publica en la libreta del
        dueño y queda inmutable.
      </span>
    </Alert>
  );
}
