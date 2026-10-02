"use client";

import { Settings, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordInput } from "@/components/ui/password-input";
import { useSessionUser } from "@/features/auth/components/session-provider";
import {
  removeOwnerAvatar,
  uploadOwnerAvatar,
} from "@/features/owner/actions/photo-actions";
import { updateProfile } from "@/features/owner/actions/pets-actions";
import type { PendingAccessRequest } from "@/features/owner/actions/pet-access-request-actions";
import { AddressMatchBanner } from "@/features/owner/components/profile/address-match-banner";
import { PendingAccessRequestsList } from "@/features/owner/components/invites/pending-access-requests-list";
import { PendingInvitesList } from "@/features/owner/components/invites/pending-invites-list";
import { SharePetAccessModal } from "@/features/owner/components/pets/share-pet-access-modal";
import { SharedAccessList } from "@/features/owner/components/profile/shared-access-list";
import type {
  PendingPetInvite,
  SharedAccess,
} from "@/features/owner/data/owner-queries";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { capitalize } from "@/lib/format";

export function ProfileView({
  sharedAccess,
  invitaciones,
  matchingPetsCount,
  accessRequests,
}: {
  sharedAccess: SharedAccess[];
  invitaciones: PendingPetInvite[];
  matchingPetsCount: number;
  accessRequests: PendingAccessRequest[];
}) {
  const { pets } = useActivePet();
  const router = useRouter();
  const user = useSessionUser();
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [invitacionesPendientes, setInvitacionesPendientes] =
    useState(invitaciones);
  const [solicitudesPendientes, setSolicitudesPendientes] =
    useState(accessRequests);
  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(" ");

  // El servidor ya nos dio la lista final tras aceptar/rechazar (`listMyPending
  // PetInvite()` de nuevo vía `router.refresh()`), pero esperar ese round-trip
  // dejaría la tarjeta mostrando por un instante una invitación ya resuelta.
  // Actualizar el estado local con lo que el propio componente hijo devuelve
  // saca ese parpadeo sin depender de que el refresh gane la carrera.
  function handleInvitesChange(restantes: PendingPetInvite[]) {
    setInvitacionesPendientes(restantes);
    router.refresh();
  }

  function handleAccessRequestsChange(restantes: PendingAccessRequest[]) {
    setSolicitudesPendientes(restantes);
    router.refresh();
  }

  // La foto de perfil se sube apenas se elige, sin esperar al botón "Guardar"
  // del formulario de datos personales: son dos acciones distintas en la
  // misma tarjeta, no un solo submit.
  async function handleAvatarChange(file: File | null) {
    setAvatarUploading(true);

    // El `try` no es decorativo: una Server Action puede **rechazar** en vez de
    // devolver un `ActionResult` —el cuerpo supera el límite del framework, se
    // cayó la red, el id de la acción quedó viejo tras un deploy— y ahí no hay
    // `result` que mirar. Sin esto, `setAvatarUploading(false)` nunca corría y
    // el selector quedaba en "Subiendo..." para siempre, mudo. Es la misma
    // trampa que ya nos costó la foto de la mascota.
    let result;
    try {
      if (file) {
        const fd = new FormData();
        fd.set("archivo", file);
        result = await uploadOwnerAvatar(fd);
      } else {
        result = await removeOwnerAvatar();
      }
    } catch {
      setAvatarUploading(false);
      toast.error(
        "No pudimos subir la foto. Probá con una imagen más liviana.",
      );
      return;
    }

    setAvatarUploading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(
      file ? "Foto de perfil actualizada." : "Se quitó la foto de perfil.",
    );
    router.refresh();
  }

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setSaving(true);
    const result = await updateProfile({
      nombre: String(form.get("nombre") ?? ""),
      apellido: String(form.get("apellido") ?? ""),
      telefono: String(form.get("telefono") ?? ""),
      direccion: String(form.get("direccion") ?? ""),
    });
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Guardamos tus datos.");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Perfil"
        actions={
          <ButtonLink href="/configuracion" variant="outline">
            <Settings className="size-4" />
            Configuración
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <AddressMatchBanner count={matchingPetsCount} />

          {solicitudesPendientes.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-foreground font-semibold">
                Solicitudes de acceso
              </h2>

              <div className="mt-5">
                <PendingAccessRequestsList
                  requests={solicitudesPendientes}
                  onChange={handleAccessRequestsChange}
                />
              </div>
            </Card>
          ) : null}

          {invitacionesPendientes.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-foreground font-semibold">
                Invitaciones pendientes
              </h2>

              <div className="mt-5">
                <PendingInvitesList
                  invitaciones={invitacionesPendientes}
                  onChange={handleInvitesChange}
                />
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="text-foreground font-semibold">Datos personales</h2>

            <div className="mt-5 flex flex-col gap-6 sm:flex-row">
              <ImageUpload
                label="Cambiar foto"
                hint="JPG o PNG, hasta 5 MB."
                className="shrink-0"
                value={user?.avatarUrl}
                disabled={avatarUploading}
                onChange={handleAvatarChange}
              />

              <form
                noValidate
                onSubmit={handleSaveProfile}
                className="flex-1 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Nombre" htmlFor="nombre">
                    <Input
                      id="nombre"
                      name="nombre"
                      defaultValue={user?.nombre}
                    />
                  </Field>
                  <Field label="Apellido" htmlFor="apellido">
                    <Input
                      id="apellido"
                      name="apellido"
                      defaultValue={user?.apellido}
                    />
                  </Field>
                </div>

                {/* El email es de solo lectura: cambiarlo manda un correo de
                    confirmación a la dirección nueva y hasta confirmarlo la
                    sesión sigue con la vieja. Merece su propio flujo, no un
                    campo mezclado con el teléfono. */}
                <Field
                  label="Email"
                  htmlFor="email"
                  hint="Para cambiarlo, escribinos desde Configuración."
                >
                  <Input id="email" type="email" value={user?.email} readOnly />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Teléfono" htmlFor="telefono">
                    <Input
                      id="telefono"
                      name="telefono"
                      type="tel"
                      defaultValue={user?.telefono}
                    />
                  </Field>
                  <Field label="Dirección" htmlFor="direccion">
                    <Input
                      id="direccion"
                      name="direccion"
                      defaultValue={user?.direccion}
                    />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </div>
              </form>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-foreground font-semibold">
              Cambiar contraseña
            </h2>

            <form noValidate className="mt-5 space-y-4">
              <Field label="Contraseña actual" htmlFor="actual">
                <PasswordInput id="actual" autoComplete="current-password" />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nueva contraseña" htmlFor="nueva">
                  <PasswordInput id="nueva" autoComplete="new-password" />
                </Field>
                <Field label="Repetir contraseña" htmlFor="repetir">
                  <PasswordInput id="repetir" autoComplete="new-password" />
                </Field>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => toast.success("Contraseña actualizada.")}
                >
                  Cambiar contraseña
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-foreground font-semibold">
                Accesos compartidos
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSharing(true)}
              >
                <UserPlus className="size-4" />
                Compartir acceso
              </Button>
            </div>

            <SharedAccessList sharedAccess={sharedAccess} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 text-center">
            <Avatar
              name={fullName}
              src={user?.avatarUrl}
              size="xl"
              className="mx-auto"
              expandable
            />
            <h2 className="text-foreground mt-4 font-bold">{fullName}</h2>
            <p className="text-muted-foreground text-sm">{user?.email}</p>
            <Badge className="mt-3">Dueño de mascota</Badge>
          </Card>

          <Card className="p-5">
            <h2 className="text-foreground font-semibold">
              Mascotas asociadas
            </h2>

            <ul className="mt-4 space-y-2">
              {pets.map((pet) => (
                <li key={pet.id}>
                  <Link
                    href={`/mascotas/${pet.id}`}
                    className="hover:bg-muted -mx-2 flex items-center gap-3 rounded-lg px-2 py-2"
                  >
                    <Avatar name={pet.nombre} src={pet.fotoUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm font-medium">
                        {pet.nombre}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {capitalize(pet.especie)} · {pet.raza}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <SharePetAccessModal
        open={sharing}
        onClose={() => setSharing(false)}
        pets={pets}
      />
    </div>
  );
}
