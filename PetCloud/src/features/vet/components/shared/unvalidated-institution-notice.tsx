"use client";

import { Alert } from "@/components/ui/alert";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";

/**
 * Migración 080: una veterinaria sin validar solo llega a sus propios
 * pacientes. Buscar o escanear una mascota que nunca pasó por la clínica
 * vuelve vacío, y sin esta explicación la pantalla diría "no encontramos esa
 * mascota" — que es falso y manda a darla de alta de nuevo.
 *
 * La regla la hace cumplir la base (RLS); esto solo la explica.
 */
export const UNVALIDATED_INSTITUTION_MESSAGE =
  "Tu veterinaria todavía no está validada: por ahora recibís pacientes con el QR de autogestión. Cuando validemos la matrícula del titular vas a poder buscar cualquier mascota.";

/**
 * `true` salvo que la sesión diga explícitamente que la institución no está
 * validada: sin sesión no hay panel, y no se muestra un aviso que no aplica.
 */
export function useInstitutionValidated(): boolean {
  const vet = useVetSession();
  return vet ? vet.institucion.validada : true;
}

export function UnvalidatedInstitutionNotice({
  className,
}: {
  className?: string;
}) {
  return (
    <Alert variant="info" className={className}>
      {UNVALIDATED_INSTITUTION_MESSAGE}
    </Alert>
  );
}
