"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { Professional, ProfessionalRole } from "@/types/vet";

const ROLE_LABELS: Record<ProfessionalRole, string> = {
  titular: "Titular",
  profesional: "Veterinario",
  asistente: "Recepcionista",
};

/**
 * Qué hace cada rol, en la letra chica que respalda cada línea.
 *
 * Cada punto sale de código verificado, no de lo que "suena razonable":
 * quién puede editar la institución e invitar al equipo lo exige la RLS de
 * la 058 (`is_institution_owner()`, no esta pantalla); que una recepcionista
 * nunca firme lo exige `enforce_signature_requires_license()` (009) porque
 * su matrícula queda forzada a NULL por el CHECK de la 058 — no es una regla
 * de UI que se pueda desactivar.
 */
const ROLE_EXPLANATIONS: Record<ProfessionalRole, string[]> = {
  titular: [
    "Es quien fundó la institución: solo el titular puede editar los datos de la veterinaria e invitar, reenviar o dar de baja a alguien del equipo.",
    "No se lo puede eliminar del equipo: es quien responde por la institución ante el municipio.",
    "Además, puede cargar y firmar consultas, vacunaciones y certificados una vez que su matrícula está validada, igual que cualquier veterinario.",
  ],
  profesional: [
    "Carga consultas y vacunaciones, gestiona la sala de espera y ve a los pacientes.",
    "Puede firmar consultas, vacunaciones y certificados una vez que PetCloud valida su matrícula. Hasta entonces, solo puede guardarlas como borrador.",
    "No puede editar los datos de la institución ni invitar o dar de baja a nadie del equipo: eso es exclusivo del titular.",
  ],
  asistente: [
    "Gestiona la sala de espera y ve a los pacientes.",
    "Nunca puede firmar un registro clínico: este rol no tiene matrícula — la base la obliga a quedar vacía — y sin ella la firma queda bloqueada aunque la pantalla lo permitiera.",
    "No puede editar los datos de la institución ni invitar o dar de baja a nadie del equipo: eso es exclusivo del titular.",
  ],
};

/**
 * Qué puede hacer cada rol, mostrado — nunca editado.
 *
 * Hasta acá el botón "Editar permisos" abría este mismo modal con `Switch`
 * que parecían guardar algo: `onClick` mostraba un `toast.success` y cerraba
 * sin escribir una sola fila. El rol se define al invitar
 * (`invite-professional-modal.tsx`) y no se puede cambiar después de que la
 * persona se suma — cambiarlo de rol es, a propósito, un caso que este
 * cambio no cubre.
 */
export function PermissionsModal({
  professional,
  onClose,
}: {
  professional: Professional | null;
  onClose: () => void;
}) {
  if (!professional) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Permisos de ${professional.nombre}`}
      description={`Qué puede hacer un rol ${ROLE_LABELS[professional.rol]} en PetCloud. Es información: el rol se define al invitar y no se edita acá.`}
      footer={<Button onClick={onClose}>Entendido</Button>}
    >
      <ul className="space-y-3 text-sm">
        {ROLE_EXPLANATIONS[professional.rol].map((linea) => (
          <li key={linea} className="text-foreground flex gap-2">
            <span aria-hidden className="text-muted-foreground">
              •
            </span>
            <span>{linea}</span>
          </li>
        ))}
      </ul>

      <Alert variant="info" className="mt-4">
        El acceso a los módulos de Administración (Ventas, Stock, Caja, Compras
        y demás) no depende de este rol: depende de si la institución tiene
        Premium activo y de qué módulos delegó el titular, sea cual sea el rol
        de la persona.
      </Alert>
    </Modal>
  );
}
