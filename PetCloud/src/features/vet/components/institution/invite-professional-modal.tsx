"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { inviteProfessional } from "@/features/vet/actions/institution-actions";
import {
  type TeamInviteValues,
  teamInviteSchema,
} from "@/features/vet/schemas/team-invite-schemas";

/**
 * "Titular" no está entre las opciones: una institución tiene un titular, el
 * que la fundó, y esa regla ya está en el CHECK de `vet_team_invites` (058) —
 * este formulario nunca dejó de coincidir con la base, ahora que la acción
 * real está detrás.
 *
 * El resultado que ve quien invita es siempre el mismo, exista o no cuenta
 * para ese email: `inviteProfessional()` no tiene forma de saberlo, así que
 * no hay nada que ocultar acá — la garantía viene de la acción, no del
 * modal (`vet-team-invitations` Requirement "Inviting an address answers
 * identically whether or not it has an account").
 */
export function InviteProfessionalModal({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  /** Refresca la lista de invitaciones pendientes del titular. */
  onInvited?: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TeamInviteValues>({ resolver: zodResolver(teamInviteSchema) });

  const onSubmit = handleSubmit(async (values) => {
    const result = await inviteProfessional(values.email, values.rol);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`Invitación enviada a ${values.email}.`);
    reset();
    onInvited?.();
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invitar profesional"
      description="Le llega un email para sumarse a la institución. La matrícula la carga la persona invitada al aceptar."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="invite-form" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar invitación"}
          </Button>
        </>
      }
    >
      <form
        noValidate
        id="invite-form"
        onSubmit={onSubmit}
        className="space-y-5"
      >
        <Field
          label="Email"
          htmlFor="email-invitacion"
          error={errors.email?.message}
          required
        >
          <Input
            id="email-invitacion"
            type="email"
            placeholder="profesional@ejemplo.com"
            {...register("email")}
          />
        </Field>

        <Field
          label="Rol"
          htmlFor="rol-invitacion"
          error={errors.rol?.message}
          required
        >
          <Select id="rol-invitacion" defaultValue="" {...register("rol")}>
            <option value="" disabled>
              Elegí un rol
            </option>
            <option value="professional">
              Veterinario — atiende, firma y gestiona la sala
            </option>
            <option value="assistant">
              Recepcionista — sala de espera y pacientes
            </option>
          </Select>
        </Field>

        <Alert variant="info">
          Para poder firmar consultas, PetCloud tiene que validar su matrícula.
          Mientras tanto puede cargar atenciones como borrador.
        </Alert>
      </form>
    </Modal>
  );
}
