"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { signUp, signUpVet } from "@/features/auth/actions/register-actions";
import { StepAccount } from "@/features/auth/components/register/step-account";
import { StepRole } from "@/features/auth/components/register/step-role";
import { StepVetInfo } from "@/features/auth/components/register/step-vet-info";
import type {
  AccountFormValues,
  RoleFormValues,
  VetInfoFormValues,
} from "@/features/auth/schemas/auth-schemas";

const STEPS_DUENO = ["Tus datos", "Tipo de perfil"];
const STEPS_VET = ["Tus datos", "Tipo de perfil", "Tu veterinaria"];

const STEP_TITLES: Record<
  RoleFormValues["role"] | "default",
  Record<number, string>
> = {
  default: { 1: "Creá tu cuenta", 2: "¿Cómo vas a usar PetCloud?" },
  dueno: { 1: "Creá tu cuenta", 2: "¿Cómo vas a usar PetCloud?" },
  veterinario: {
    1: "Creá tu cuenta",
    2: "¿Cómo vas a usar PetCloud?",
    3: "Contanos sobre tu veterinaria",
  },
};

/**
 * Errores que vuelven del alta. Van tipados por paso porque cada uno solo puede
 * pintar los campos que muestra: un error de contraseña no tiene dónde ir en el
 * paso de la veterinaria, y ahí se muestra arriba como error
 * general.
 */
type AccountStepError = { field?: "email"; message: string };
type VetStepError = { field?: "matricula"; message: string };

export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [account, setAccount] = useState<AccountFormValues>();
  const [role, setRole] = useState<RoleFormValues["role"]>();
  const [accountError, setAccountError] = useState<AccountStepError>();
  const [vetError, setVetError] = useState<VetStepError>();

  const steps = role === "veterinario" ? STEPS_VET : STEPS_DUENO;

  function handleAccountNext(values: AccountFormValues) {
    setAccount(values);
    setAccountError(undefined);
    setStep(2);
  }

  async function handleRoleNext(selectedRole: RoleFormValues["role"]) {
    setRole(selectedRole);

    // El veterinario necesita un paso más antes de crear la cuenta: los datos
    // de la veterinaria, que el dueño no tiene.
    if (selectedRole === "veterinario") {
      setStep(3);
      return;
    }

    if (!account) return;

    const result = await signUp(account);

    if (!result.success) {
      // La cuenta se crea al final, cuando ya se conoce el rol, así que un email
      // repetido se descubre acá. Se vuelve al paso 1 con el error en su campo:
      // el problema está ahí y ahí tiene que leerse.
      setAccountError({
        field: result.field === "email" ? "email" : undefined,
        message: result.error,
      });
      setStep(1);
      return;
    }

    router.push(result.redirectTo);
  }

  async function handleVetInfoSubmit(vet: VetInfoFormValues) {
    if (!account) return;

    const result = await signUpVet({ account, vet });

    if (!result.success) {
      if (result.field === "email") {
        setAccountError({ field: "email", message: result.error });
        setStep(1);
        return;
      }

      setVetError({
        field: result.field === "matricula" ? "matricula" : undefined,
        message: result.error,
      });
      return;
    }

    router.push(result.redirectTo);
  }

  return (
    <Card className="w-full max-w-lg">
      <Stepper steps={steps} current={Math.min(step, steps.length)} />

      <h1 className="text-foreground mt-6 text-xl font-bold">
        {STEP_TITLES[role ?? "default"][step]}
      </h1>

      <div className="mt-6">
        {step === 1 ? (
          <StepAccount
            defaultValues={account}
            serverError={accountError}
            onNext={handleAccountNext}
          />
        ) : null}

        {step === 2 ? (
          <StepRole
            defaultRole={role}
            onNext={handleRoleNext}
            onBack={() => setStep(1)}
          />
        ) : null}

        {step === 3 && role === "veterinario" ? (
          <StepVetInfo
            serverError={vetError}
            onSubmit={handleVetInfoSubmit}
            onBack={() => setStep(2)}
          />
        ) : null}
      </div>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        ¿Ya tenés cuenta?{" "}
        <a href="/login" className="text-brand-600 font-medium hover:underline">
          Iniciá sesión
        </a>
      </p>
    </Card>
  );
}
