import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  // El formulario lee `?next` y `?error` de la URL con `useSearchParams`, que
  // exige un límite de Suspense.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
