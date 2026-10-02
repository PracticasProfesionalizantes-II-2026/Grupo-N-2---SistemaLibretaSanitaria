"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { getPostLoginRoute } from "@/config/roles";
import {
  ScheduleEditor,
  defaultSchedule,
} from "@/features/onboarding/components/schedule-editor";
import { updateSchedule } from "@/features/vet/actions/institution-actions";
import type { FullSchedule } from "@/features/vet/schemas/schedule-schemas";
import { TeamInviteEditor } from "@/features/onboarding/components/team-invite-editor";
import {
  type InstitutionFormValues,
  institutionSchema,
} from "@/features/onboarding/schemas/onboarding-schemas";

const STEPS = ["Institución", "Horarios", "Equipo"];

export function VetOnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [horarios, setHorarios] = useState<FullSchedule>(defaultSchedule);
  const [guardandoHorarios, setGuardandoHorarios] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InstitutionFormValues>({
    resolver: zodResolver(institutionSchema),
  });

  const onSubmitInstitution = handleSubmit(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    setStep(2);
  });

  /**
   * El único paso del asistente que guarda de verdad (068). Si falla no
   * bloquea el alta: los horarios se cargan después desde Institución, y
   * trabar el onboarding por un dato opcional sería peor.
   */
  async function handleSaveSchedule() {
    setGuardandoHorarios(true);
    const result = await updateSchedule(horarios);
    setGuardandoHorarios(false);

    if (!result.success) {
      toast.error(`${result.error} Podés cargarlos después desde Institución.`);
    }

    setStep(3);
  }

  function handleFinish() {
    toast.success("¡Tu veterinaria ya está configurada!");
    router.push(getPostLoginRoute("veterinario"));
  }

  return (
    <Card className="w-full max-w-lg">
      <Stepper steps={STEPS} current={step} />

      {step === 1 ? (
        <>
          <h1 className="text-foreground mt-6 text-xl font-bold">
            Completá los datos de tu veterinaria
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Es lo que van a ver los dueños cuando busquen tu veterinaria.
          </p>

          <form
            noValidate
            onSubmit={onSubmitInstitution}
            className="mt-6 space-y-5"
          >
            <Field
              label="Nombre"
              htmlFor="nombre"
              error={errors.nombre?.message}
              required
            >
              <Input id="nombre" {...register("nombre")} />
            </Field>

            <Field
              label="Dirección"
              htmlFor="direccion"
              error={errors.direccion?.message}
              required
            >
              <Input id="direccion" {...register("direccion")} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Teléfono"
                htmlFor="telefono"
                error={errors.telefono?.message}
                required
              >
                <Input id="telefono" type="tel" {...register("telefono")} />
              </Field>

              <Field
                label="Email de contacto"
                htmlFor="email"
                error={errors.email?.message}
                required
              >
                <Input id="email" type="email" {...register("email")} />
              </Field>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Guardando..." : "Continuar"}
            </Button>
          </form>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h1 className="text-foreground mt-6 text-xl font-bold">
            Horarios de atención
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Definen en qué franjas recibís mascotas. Los editás cuando quieras.
          </p>

          <div className="mt-6">
            <ScheduleEditor onChange={setHorarios} />
          </div>

          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep(1)}
            >
              Atrás
            </Button>
            <Button
              className="flex-1"
              onClick={handleSaveSchedule}
              disabled={guardandoHorarios}
            >
              {guardandoHorarios ? "Guardando..." : "Continuar"}
            </Button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h1 className="text-foreground mt-6 text-xl font-bold">
            Invitá a tu equipo
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Cada profesional firma sus propias consultas con su matrícula.
          </p>

          <div className="mt-6">
            <TeamInviteEditor />
          </div>

          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep(2)}
            >
              Atrás
            </Button>
            <Button className="flex-1" onClick={handleFinish}>
              Finalizar
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}
