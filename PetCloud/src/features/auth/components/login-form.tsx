"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { isAppRoute } from "@/config/app-routes";
import { signIn } from "@/features/auth/actions/session-actions";
import {
  type LoginFormValues,
  loginSchema,
} from "@/features/auth/schemas/auth-schemas";
import { useFormDraft } from "@/lib/use-form-draft";

/**
 * A dónde se puede volver después de entrar.
 *
 * `next` lo pone el proxy cuando intercepta una pantalla protegida, pero llega
 * por la URL y ahí puede escribir cualquiera. Se exige que sea una ruta real de
 * la aplicación: un `next` inventado —o una URL mal tipeada que el proxy mandó
 * acá— terminaría llevando a un 404 justo después de un login exitoso, que es la
 * peor forma de estrenar una sesión. Si no pasa el filtro se ignora y cada quien
 * entra a su panel.
 */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;

  // El destino puede traer query string; para comparar interesa solo la ruta.
  const pathname = value.split(/[?#]/)[0];

  return isAppRoute(pathname) ? value : null;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Si el proxy interceptó una ruta protegida, se vuelve ahí después de entrar
  // en vez de dejar a la persona en el inicio de su panel.
  const next = safeNext(searchParams.get("next"));

  const form = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  // Nunca la contraseña: el borrador es solo para no tener que retipear el
  // email si la persona se va y vuelve.
  const { clearDraft } = useFormDraft("login", form, ["password"]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await signIn(values);

    if (!result.success) {
      setError("root", { message: result.error, type: result.code ?? "error" });
      return;
    }

    clearDraft();
    toast.success("¡Bienvenido de nuevo!");
    router.push(next ?? result.redirectTo);
  });

  return (
    <Card className="w-full max-w-md">
      <h1 className="text-foreground text-xl font-bold">Iniciar sesión</h1>

      <form noValidate onSubmit={onSubmit} className="mt-4 space-y-5">
        {errors.root ? (
          <Alert variant="danger">{errors.root.message}</Alert>
        ) : null}

        <Field
          label="Email"
          htmlFor="email"
          error={errors.email?.message}
          required
        >
          {/* "username", no "email": es el token que los gestores de
              contraseñas esperan en un formulario de INICIO DE SESIÓN para el
              identificador, aunque el campo sea un email — distinto del
              registro, donde sí correspondía "email" porque ahí se está
              creando la cuenta. */}
          <Input
            id="email"
            type="email"
            autoComplete="username"
            {...register("email")}
          />
        </Field>

        <Field
          label="Contraseña"
          htmlFor="password"
          error={errors.password?.message}
          required
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            {...register("password")}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        ¿No tenés cuenta?{" "}
        <Link
          href="/registro"
          className="text-brand-600 font-medium hover:underline"
        >
          Creá una gratis
        </Link>
      </p>
    </Card>
  );
}
