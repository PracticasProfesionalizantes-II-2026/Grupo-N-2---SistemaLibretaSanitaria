import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { HealthStatusChip } from "@/components/ui/status-chip";
import { Logo } from "@/components/layout/logo";
import { RabiesBadge } from "@/features/public-qr/components/rabies-badge";
import { capitalize, formatAge } from "@/lib/format";
import type { PublicPet } from "@/features/public-qr/data/public-pet";

/**
 * Ficha del collar: lo que ve quien escanea el QR sin tener cuenta. Datos
 * básicos de la mascota y la antirrábica; nunca datos del dueño.
 */
export function CollarProfile({
  pet,
  logoHref,
}: {
  pet: PublicPet;
  /** A dónde vuelve el logo. Sin sesión, el default de `Logo` ("/") ya es correcto. */
  logoHref?: string;
}) {
  return (
    <div className="bg-muted min-h-svh">
      <header className="border-border bg-card border-b">
        <Container className="flex h-16 items-center justify-between">
          <Logo href={logoHref} />
          <span className="text-muted-foreground text-xs">
            Ficha pública del collar
          </span>
        </Container>
      </header>

      <Container className="py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <Avatar
                name={pet.nombre}
                src={pet.fotoUrl}
                size="xl"
                expandable
              />
              <div>
                <h2 className="text-foreground text-2xl font-bold">
                  {pet.nombre}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {/* Sin fecha de nacimiento la edad viene vacía, y escrito a
                      mano el separador quedaba colgando al final. */}
                  {[
                    pet.especie ? capitalize(pet.especie) : null,
                    pet.raza,
                    pet.fechaNacimiento ? formatAge(pet.fechaNacimiento) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <dl className="border-border mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-6 sm:grid-cols-3">
              {/*
                La antirrábica va primero y ocupa dos columnas: es el único dato
                sanitario que le sirve a un tercero con el animal delante, y el
                que puede tener que leer apurado después de una mordedura.
              */}
              {/* Cada bloque se dibuja solo si el dato llegó: lo que el dueño
                  ocultó en la privacidad del QR viene en `null` desde el
                  servidor, no se esconde acá. */}
              {pet.estadoAntirrabica && pet.estadoSanitario ? (
                <>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">
                      Antirrábica
                    </dt>
                    <dd className="mt-1">
                      <RabiesBadge estado={pet.estadoAntirrabica} />
                    </dd>
                  </div>
                  <div>
                    {/*
                      "Vacunación general" y ya no "Vacunación": con los dos
                      chips juntos, un "Al día" a secas al lado de "Antirrábica
                      vencida" se lee como una contradicción en vez de como dos
                      preguntas distintas.
                    */}
                    <dt className="text-muted-foreground text-xs">
                      Vacunación general
                    </dt>
                    <dd className="mt-1">
                      <HealthStatusChip status={pet.estadoSanitario} />
                    </dd>
                  </div>
                </>
              ) : null}
              {pet.sexo ? (
                <div>
                  <dt className="text-muted-foreground text-xs">Sexo</dt>
                  <dd className="text-foreground mt-0.5 text-sm font-medium">
                    {capitalize(pet.sexo)}
                  </dd>
                </div>
              ) : null}
              {pet.color ? (
                <div>
                  <dt className="text-muted-foreground text-xs">Señas</dt>
                  <dd className="text-foreground mt-0.5 text-sm font-medium">
                    {pet.color}
                  </dd>
                </div>
              ) : null}
              {pet.castrado !== null ? (
                <div>
                  <dt className="text-muted-foreground text-xs">Castrado</dt>
                  <dd className="text-foreground mt-0.5 text-sm font-medium">
                    {pet.castrado ? "Sí" : "No"}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground text-xs">Nº de collar</dt>
                <dd className="text-foreground mt-0.5 font-mono text-sm font-medium">
                  {pet.qrCode}
                </dd>
              </div>
              {pet.registroMunicipal ? (
                <div>
                  <dt className="text-muted-foreground text-xs">
                    Registro municipal
                  </dt>
                  <dd className="text-foreground mt-0.5 font-mono text-sm font-medium">
                    {pet.registroMunicipal}
                  </dd>
                </div>
              ) : null}
              {pet.microchip ? (
                <div>
                  <dt className="text-muted-foreground text-xs">Microchip</dt>
                  <dd className="text-foreground mt-0.5 font-mono text-sm font-medium">
                    {pet.microchip}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="brand">Historial clínico privado</Badge>
              <Badge variant="neutral">Sin datos personales</Badge>
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              El QR del collar identifica a la mascota y sirve para devolverla a
              su casa. Su historial médico solo lo ven su dueño y las
              veterinarias que la atienden.
            </p>
          </Card>
        </div>
      </Container>
    </div>
  );
}
