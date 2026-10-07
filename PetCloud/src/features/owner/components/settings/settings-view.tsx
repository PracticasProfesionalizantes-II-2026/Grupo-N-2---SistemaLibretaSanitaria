"use client";

import {
  CircleHelp,
  Download,
  FileText,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { deleteOwnerAccount } from "@/features/owner/actions/account-actions";
import { useSessionUser } from "@/features/auth/components/session-provider";
import { useIsMounted } from "@/lib/use-is-mounted";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/features/auth/lib/use-sign-out";
import { signOut as signOutClient } from "next-auth/react";

const THEMES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

// Solo rutas que existen. Antes había cuatro entradas y tres apuntaban a
// pantallas que nunca se construyeron: el enlace se veía igual de real y
// terminaba en un 404.
const HELP_LINKS = [
  { label: "Ayuda y soporte", href: "/configuracion/ayuda", icon: CircleHelp },
  { label: "Términos de uso", href: "/legales/terminos", icon: FileText },
];

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { signOut } = useSignOut();
  const user = useSessionUser();
  const mounted = useIsMounted();

  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  async function confirmarEliminarCuenta() {
    setDeletingBusy(true);
    const result = await deleteOwnerAccount();

    if (!result.success) {
      setDeletingBusy(false);
      toast.error(result.error);
      return;
    }

    // La cuenta ya no existe en el servidor, pero la cookie de sesión sigue
    // siendo válida hasta que se borre a propósito: sin este paso, la persona
    // se queda "logueada" en un panel de datos que ya no están.
    //
    // Este cierre de sesión se hace desde el cliente (no una Server Action) a
    // propósito: cualquier mutación de cookies dentro de una Server Action
    // fuerza a Next a re-renderizar la página actual como parte de esa misma
    // respuesta, y el layout, al llamar `requireUser()` sobre una cuenta que
    // ya no existe, dispara su propio redirect ahí adentro — dos señales de
    // redirect pisándose en la misma respuesta, que el navegador no sabe
    // interpretar y se queda esperando para siempre. Acá no hay Server Action
    // de por medio, así que no hay re-render que competir.
    toast.success("Tu cuenta se eliminó.");
    await signOutClient({ redirect: false });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a propósito: `router.push` reutiliza el árbol de React ya montado (sesión de una cuenta que ya no existe); una navegación dura carga "/" de cero.
    window.location.href = "/";
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configuración" />

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="text-foreground font-semibold">
            Información de la cuenta
          </h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Nombre</dt>
              <dd className="text-foreground font-medium">
                {[user?.nombre, user?.apellido].filter(Boolean).join(" ")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground font-medium">{user?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Rol</dt>
              <dd className="text-foreground font-medium">Dueño de mascota</dd>
            </div>
          </dl>

          <Link
            href="/perfil"
            className="text-brand-700 mt-4 inline-block text-sm font-medium hover:underline"
          >
            Editar datos personales
          </Link>
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


        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Privacidad y datos</h2>

          <div className="mt-4 space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                toast.success(
                  "Te vamos a enviar tus datos por email en unos minutos.",
                )
              }
            >
              <Download className="size-4" />
              Descargar mis datos
            </Button>

            <Button
              variant="outline"
              className="text-danger w-full justify-start"
              onClick={() => setDeletingAccount(true)}
            >
              <Trash2 className="size-4" />
              Eliminar mi cuenta
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Ayuda y soporte</h2>

          <ul className="mt-4 space-y-1">
            {HELP_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-foreground hover:bg-muted -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm"
                >
                  <link.icon className="text-muted-foreground size-4" />
                  {link.label}
                </Link>
              </li>
            ))}
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

      <ConfirmDialog
        open={deletingAccount}
        onClose={() => setDeletingAccount(false)}
        onConfirm={confirmarEliminarCuenta}
        loading={deletingBusy}
        title="¿Eliminar tu cuenta?"
        description="Se van a borrar tus datos y los de las mascotas de las que sos único dueño, incluido su historial sanitario. Las mascotas que compartís con otra persona no se borran: quedan a nombre de esa persona. Esta acción no se puede deshacer."
        confirmLabel="Eliminar cuenta"
      />
    </div>
  );
}
