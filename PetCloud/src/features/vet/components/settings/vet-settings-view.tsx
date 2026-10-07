"use client";

import { FileText, LifeBuoy, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/features/auth/lib/use-sign-out";

const NOTIFICATION_TYPES = [
  { key: "solicitudes", label: "Llegadas nuevas a la sala de espera" },
  { key: "cancelaciones", label: "Cancelaciones y ausencias" },
  { key: "matriculas", label: "Novedades sobre validación de matrículas" },
];

const THEMES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

/**
 * `firma` llega como slot desde la pantalla (server component) y no se arma
 * acá: la sección necesita leer `vet_signatures` y firmar las URL del bucket
 * privado, que es trabajo de servidor. Mismo patrón que `accesoModulos` en
 * `/veterinaria/institucion`.
 */
export function VetSettingsView({ firma }: { firma: ReactNode }) {
  const { theme, setTheme } = useTheme();
  const { signOut } = useSignOut();
  const vet = useVetSession();
  const nombre = [vet?.usuario.nombre, vet?.usuario.apellido]
    .filter(Boolean)
    .join(" ");
  const mounted = useIsMounted();

  const [channels, setChannels] = useState({ push: true, email: true });
  const [types, setTypes] = useState<Record<string, boolean>>({
    solicitudes: true,
    cancelaciones: true,
    matriculas: false,
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Configuración"
        breadcrumbs={[
          { label: "Gestión", href: "/veterinaria/gestion" },
          { label: "Configuración" },
        ]}
      />

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Cuenta</h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Profesional</dt>
              <dd className="text-foreground font-medium">{nombre}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Matrícula</dt>
              <dd className="text-foreground font-medium">{vet?.matricula}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground font-medium">
                {vet?.usuario.email}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Institución</dt>
              <dd className="text-foreground font-medium">
                {vet?.institucion.nombre}
              </dd>
            </div>
          </dl>

          <Link
            href="/veterinaria/institucion"
            className="text-brand-700 mt-4 inline-block text-sm font-medium hover:underline"
          >
            Editar datos de la institución
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Cambiar contraseña</h2>

          <form
            noValidate
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              toast.success("Contraseña actualizada.");
            }}
          >
            <Field label="Contraseña actual" htmlFor="password-actual" required>
              <PasswordInput id="password-actual" />
            </Field>

            <Field label="Nueva contraseña" htmlFor="password-nueva" required>
              <PasswordInput id="password-nueva" />
            </Field>

            <Field
              label="Repetir nueva contraseña"
              htmlFor="password-repetir"
              required
            >
              <PasswordInput id="password-repetir" />
            </Field>

            <div className="flex justify-end">
              <Button type="submit">Actualizar contraseña</Button>
            </div>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Notificaciones</h2>

          <div className="mt-5 space-y-4">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              Canales
            </p>
            <Switch
              id="vet-canal-push"
              label="Notificaciones push"
              checked={channels.push}
              onChange={(checked) =>
                setChannels({ ...channels, push: checked })
              }
            />
            <Switch
              id="vet-canal-email"
              label="Email"
              checked={channels.email}
              onChange={(checked) =>
                setChannels({ ...channels, email: checked })
              }
            />

            <p className="text-muted-foreground border-border border-t pt-4 text-xs font-semibold uppercase">
              Qué quiero recibir
            </p>
            {NOTIFICATION_TYPES.map((type) => (
              <Switch
                key={type.key}
                id={`vet-tipo-${type.key}`}
                label={type.label}
                checked={types[type.key]}
                onChange={(checked) =>
                  setTypes({ ...types, [type.key]: checked })
                }
              />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Apariencia</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Elegí cómo se ve PetCloud en este dispositivo.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors",
                  mounted && theme === option.value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-border text-muted-foreground hover:border-brand-300",
                )}
                aria-pressed={mounted && theme === option.value}
              >
                <option.icon className="size-5" />
                <span className="text-sm font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </Card>

        {firma}

        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Ayuda y soporte</h2>

          <ul className="mt-4 space-y-1">
            <li>
              <Link
                href="/contacto?tipo=veterinaria"
                className="text-foreground hover:bg-muted -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm"
              >
                <LifeBuoy className="text-muted-foreground size-4" />
                Contactar a soporte
              </Link>
            </li>
            <li>
              <Link
                href="/legales/terminos"
                className="text-foreground hover:bg-muted -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm"
              >
                <FileText className="text-muted-foreground size-4" />
                Términos de uso
              </Link>
            </li>
          </ul>
        </Card>

        <Button
          variant="outline"
          className="text-danger w-full"
          onClick={() => {
            signOut();
          }}
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
