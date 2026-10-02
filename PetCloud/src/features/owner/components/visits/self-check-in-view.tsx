"use client";

import { PawPrint, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SelectableCard } from "@/components/ui/selectable-card";
import {
  resolveWaitingRoomSession,
  selfCheckIn,
  type SelfCheckInResult,
} from "@/features/owner/actions/waiting-room-checkin-actions";
import { useNewPetDialog } from "@/features/owner/components/pets/new-pet-dialog-provider";
import { capitalize } from "@/lib/format";
import type { Pet } from "@/types/pet";

/**
 * Autogestión en la sala de espera: escanear el QR de la institución, elegir
 * la mascota, confirmar, y listo — sin pasar por el mostrador.
 *
 * `reason` e `is_urgent` no aparecen en ningún lado de esta pantalla: no es
 * que se omitan de un formulario, es que no existe ningún campo para
 * ellos (Req. 10). El único trabajo real ocurre en el servidor, adentro de
 * `waiting_room_self_check_in()` (053) — acá sólo se pide un tap de más
 * antes de escribir nada, para que un enlace viejo o reenviado no anote una
 * visita que nadie pidió.
 */
export function SelfCheckInView({
  code,
  misMascotas,
}: {
  code: string;
  misMascotas: Pet[];
}) {
  const abrirAlta = useNewPetDialog();

  const [resolviendo, setResolviendo] = useState(true);
  const [codigoVivo, setCodigoVivo] = useState(false);

  const [selectedPetId, setSelectedPetId] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<SelfCheckInResult | null>(null);

  useEffect(() => {
    let cancelado = false;

    resolveWaitingRoomSession(code).then((preview) => {
      if (cancelado) return;
      setCodigoVivo(preview.estado === "vivo");
      setResolviendo(false);
    });

    return () => {
      cancelado = true;
    };
  }, [code]);

  const petIdActivo =
    selectedPetId ?? (misMascotas.length === 1 ? misMascotas[0].id : undefined);
  const petElegida = misMascotas.find((pet) => pet.id === petIdActivo);

  async function confirmar() {
    if (!petIdActivo) return;

    setEnviando(true);
    const respuesta = await selfCheckIn(code, petIdActivo);
    setEnviando(false);

    setResultado(respuesta);
  }

  function reintentar() {
    setResultado(null);
    setSelectedPetId(undefined);
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Ingreso a la sala de espera"
        description="Anotate solo en la cola desde acá, sin pasar por el mostrador."
        breadcrumbs={[
          { label: "Visitas", href: "/visitas" },
          { label: "Ingreso" },
        ]}
      />

      {resolviendo ? (
        <Card className="p-5">
          <p className="text-muted-foreground text-sm">
            Verificando el código…
          </p>
        </Card>
      ) : !codigoVivo ? (
        <Card className="p-5">
          <Alert variant="danger">
            Este código no es válido. Puede estar vencido, revocado, o mal
            escaneado — pedile al mostrador que te anote o que te muestre el QR
            vigente.
          </Alert>
        </Card>
      ) : resultado ? (
        <ResultadoCheckIn
          resultado={resultado}
          pet={petElegida}
          onReintentar={reintentar}
        />
      ) : (
        <div className="space-y-4">
          {misMascotas.length === 0 ? (
            <EmptyState
              icon={PawPrint}
              title="Todavía no tenés mascotas registradas"
              description="Registrá tu mascota primero para poder anotarla en la sala de espera."
              action={
                <Button onClick={abrirAlta}>
                  <Plus className="size-4" />
                  Registrar mascota
                </Button>
              }
            />
          ) : (
            <>
              <Card className="p-5">
                <h2 className="text-foreground font-semibold">
                  ¿Para qué mascota es la visita?
                </h2>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {misMascotas.map((pet) => (
                    <SelectableCard
                      key={pet.id}
                      icon={PawPrint}
                      title={pet.nombre}
                      description={`${capitalize(pet.especie)}${pet.raza ? ` · ${pet.raza}` : ""}`}
                      selected={petIdActivo === pet.id}
                      onClick={() => setSelectedPetId(pet.id)}
                    />
                  ))}
                </div>
              </Card>

              {petIdActivo && petElegida ? (
                <Card className="p-5">
                  <p className="text-foreground text-sm">
                    Vas a anotar a <strong>{petElegida.nombre}</strong> en la
                    sala de espera.
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Se suma a la cola por orden de llegada, igual que si te
                    hubieras anotado en el mostrador.
                  </p>

                  <Button
                    className="mt-4 w-full"
                    onClick={confirmar}
                    disabled={enviando}
                  >
                    {enviando ? "Anotando…" : "Confirmar ingreso"}
                  </Button>
                </Card>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultadoCheckIn({
  resultado,
  pet,
  onReintentar,
}: {
  resultado: SelfCheckInResult;
  pet: Pet | undefined;
  onReintentar: () => void;
}) {
  if (resultado.estado === "ok") {
    return (
      <Card className="p-5">
        <Alert variant="success">
          ¡Listo! {pet?.nombre ?? "Tu mascota"} quedó anotada en la sala de
          espera. Te van a llamar por orden de llegada.
        </Alert>
        {pet ? (
          <div className="mt-4">
            <ButtonLink href={`/mascotas/${pet.id}`} variant="outline">
              Ver la libreta de {pet.nombre}
            </ButtonLink>
          </div>
        ) : null}
      </Card>
    );
  }

  const { variant, mensaje, permiteReintentar } = copiaResultado(resultado);

  return (
    <Card className="p-5">
      <Alert variant={variant}>{mensaje}</Alert>
      {permiteReintentar ? (
        <Button className="mt-4" variant="outline" onClick={onReintentar}>
          Volver a intentar
        </Button>
      ) : null}
    </Card>
  );
}

function copiaResultado(
  resultado: Exclude<SelfCheckInResult, { estado: "ok" }>,
): {
  variant: "warning" | "info" | "danger";
  mensaje: string;
  permiteReintentar: boolean;
} {
  switch (resultado.estado) {
    case "code_not_live":
      return {
        variant: "danger",
        mensaje:
          "Este código ya no es válido — puede estar vencido o revocado. Pedile al mostrador que te anote o que te muestre el QR vigente.",
        permiteReintentar: false,
      };
    case "pet_unavailable":
      // Mismo mensaje sin importar si la mascota no es tuya o directamente no
      // existe: el spec exige que las dos causas sean indistinguibles desde
      // acá (Req. 5), así que este texto no puede dar ninguna pista de cuál
      // de las dos pasó.
      return {
        variant: "warning",
        mensaje:
          "No pudimos anotar a esa mascota. Revisá que la hayas seleccionado bien, o pedile al mostrador que te ayude.",
        permiteReintentar: true,
      };
    case "already_waiting":
      return {
        variant: "info",
        mensaje: "Esa mascota ya está anotada en la sala de espera.",
        permiteReintentar: false,
      };
    case "error":
      return {
        variant: "danger",
        mensaje: resultado.error,
        permiteReintentar: true,
      };
  }
}
