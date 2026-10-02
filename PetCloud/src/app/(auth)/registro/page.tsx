import type { Metadata } from "next";

import { RegisterWizard } from "@/features/auth/components/register/register-wizard";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegistroPage() {
  return <RegisterWizard />;
}
