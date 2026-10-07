"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { PremiumErpBenefits } from "@/features/vet/components/premium/premium-erp-benefits";
import {
  cancelPremiumSimulado,
  simulatePremiumCheckout,
} from "@/features/vet/actions/premium-simulation-actions";
import type {
  CurrentPremiumPrice,
  InstitutionSubscription,
} from "@/features/vet/data/subscription";
import type { PremiumState } from "@/features/vet/lib/vet-premium";
import { formatARS } from "@/lib/money";
import { fechaArgentina } from "@/lib/argentina-time";

/** `hasta` siempre es un TIMESTAMPTZ completo: mismo criterio de formateo que `audit-log-view.tsx`. */
function formatTimestamp(iso: string) {
  return fechaArgentina(iso, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type ViewState =
  | { kind: "sin_precio" }
  | { kind: "sin_suscripcion"; price: CurrentPremiumPrice }
  | { kind: "pendiente" }
  | { kind: "rechazado" }
  | { kind: "vencido"; price: CurrentPremiumPrice | null }
  | { kind: "activo" | "en_gracia" | "cancelado"; hasta: string | null };

/**
 * `premium.estado` (de `vet-premium.ts`) ya resuelve los tres estados
 * "activos" (activo/en_gracia/cancelado-en-período); acá solo hace falta
 * distinguir, dentro de "vencido"/"sin_suscripcion", el detalle fino que
 * requiere la spec (pendiente vs. rechazado nunca dicen "ya sos Premium" de
 * la misma forma) — para eso se usa el `status` crudo de `subscription`.
 */
function resolveViewState(
  premium: PremiumState,
  subscription: InstitutionSubscription | null,
  price: CurrentPremiumPrice | null,
): ViewState {
  if (premium.activo) {
    return {
      kind: premium.estado as "activo" | "en_gracia" | "cancelado",
      hasta: premium.hasta,
    };
  }

  if (premium.estado === "sin_suscripcion") {
    return price ? { kind: "sin_suscripcion", price } : { kind: "sin_precio" };
  }

  if (subscription?.status === "pending") return { kind: "pendiente" };
  if (subscription?.status === "rejected") return { kind: "rechazado" };

  return { kind: "vencido", price };
}

const ESTADO_BADGE: Record<
  ViewState["kind"],
  { label: string; variant: "success" | "warning" | "neutral" | "danger" }
> = {
  activo: { label: "Premium activo", variant: "success" },
  en_gracia: { label: "Premium en gracia", variant: "warning" },
  cancelado: { label: "Premium cancelada", variant: "neutral" },
  pendiente: { label: "Pago en proceso", variant: "neutral" },
  rechazado: { label: "Pago rechazado", variant: "danger" },
  vencido: { label: "Sin Premium", variant: "danger" },
  sin_suscripcion: { label: "Sin Premium", variant: "neutral" },
  sin_precio: { label: "Sin Premium", variant: "neutral" },
};

export function PremiumView({
  soyTitular,
  premium,
  price,
  subscription,
}: {
  /**
   * Solo el titular ve controles de pago (spec: "Billing surface is
   * owner-only"); el resto de los profesionales ve el estado del módulo,
   * nunca "Suscribirme" ni "Cancelar".
   */
  soyTitular: boolean;
  premium: PremiumState;
  price: CurrentPremiumPrice | null;
  subscription: InstitutionSubscription | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);

  const state = resolveViewState(premium, subscription, price);
  const badge = ESTADO_BADGE[state.kind];

  /**
   * El alta es siempre simulada (demo): no hay pasarela a la que redirigir.
   * Al volver, la revalidación del layout ya trae la sesión con Premium
   * activo y la pantalla se reacomoda sola.
   */
  function handleCheckout() {
    startTransition(async () => {
      const result = await simulatePremiumCheckout();

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        "Premium quedó activo. Pago simulado (demo): no se cobró nada.",
      );
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelPremiumSimulado();

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setCancelling(false);
      toast.success(
        "Cancelaste la suscripción. Mantenés el acceso hasta el fin del período.",
      );
    });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Premium"
        description="Suscripción y facturación del módulo pago de PetCloud."
        breadcrumbs={[
          { label: "Gestión", href: "/veterinaria/gestion" },
          { label: "Premium" },
        ]}
      />

      {!soyTitular ? (
        <Card className="p-5">
          <h2 className="text-foreground flex items-center gap-2 font-semibold">
            Premium
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </h2>
          <p className="text-muted-foreground mt-4 text-sm">
            Pedile al responsable de la institución que gestione la suscripción
            Premium.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/*
            El aviso va arriba de todo y antes de cualquier tarjeta de estado,
            nunca debajo ni en un tooltip: si aparece después de leer "Premium
            activo", ya se creyó que hubo un cobro. Mismo criterio que el cobro
            simulado de una venta en `erp/components/sales/`.
          */}
          {
            <Alert variant="warning">
              <p className="font-semibold">Pago simulado (demo).</p>
              <p className="mt-1">
                {premium.activo
                  ? "Premium se activó sin ningún cobro: no hay una suscripción paga real detrás."
                  : "Suscribirse acá no cobra nada: activa el módulo al instante, para probar y demostrar el producto."}
              </p>
            </Alert>
          }

          {state.kind === "sin_precio" ? (
            <Card className="p-5">
              <h2 className="text-foreground font-semibold">Premium</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Todavía no configuramos un precio para el módulo Premium.
                Escribinos para coordinar el alta.
              </p>
            </Card>
          ) : null}

          {state.kind === "sin_suscripcion" ? (
            <Card className="p-5">
              <h2 className="text-foreground font-semibold">Hacete Premium</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Sumá el módulo de Administración, Turnos y las próximas
                funciones pagas de PetCloud.
              </p>
              <p className="text-foreground mt-4 text-2xl font-bold">
                {formatARS(state.price.amountCents)}
                <span className="text-muted-foreground text-sm font-normal">
                  {" "}
                  por mes
                </span>
              </p>
              <Button
                className="mt-5"
                onClick={handleCheckout}
                disabled={isPending}
              >
                {isPending ? "Procesando el pago simulado…" : "Suscribirme"}
              </Button>
            </Card>
          ) : null}

          {state.kind === "pendiente" ? (
            <Alert variant="info">
              Tu pago está en proceso — todavía no activamos Premium.
            </Alert>
          ) : null}

          {state.kind === "rechazado" ? (
            <Alert variant="danger">
              <p>El pago fue rechazado. Podés volver a intentarlo.</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={handleCheckout}
                disabled={isPending}
              >
                {isPending ? "Reintentando..." : "Reintentar pago"}
              </Button>
            </Alert>
          ) : null}

          {state.kind === "vencido" ? (
            <Alert variant="warning">
              <p>
                Tu suscripción Premium no está activa. Administración y Turnos
                quedan bloqueados hasta que te vuelvas a suscribir; el resto de
                tus datos sigue intacto.
              </p>
              {state.price ? (
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={handleCheckout}
                  disabled={isPending}
                >
                  {isPending ? "Procesando el pago simulado…" : "Suscribirme"}
                </Button>
              ) : null}
            </Alert>
          ) : null}

          {state.kind === "activo" || state.kind === "en_gracia" ? (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-foreground flex items-center gap-2 font-semibold">
                    Premium
                    <Badge
                      variant={state.kind === "activo" ? "success" : "warning"}
                    >
                      {state.kind === "activo" ? "Activo" : "En gracia"}
                    </Badge>
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {state.kind === "activo"
                      ? `Acceso simulado${
                          state.hasta
                            ? ` hasta el ${formatTimestamp(state.hasta)}`
                            : ""
                        }, sin cobro asociado.`
                      : `El último cobro no se pudo procesar.${
                          state.hasta
                            ? ` Tenés hasta el ${formatTimestamp(state.hasta)} para regularizarlo`
                            : ""
                        } antes de que se bloqueen Administración y Turnos.`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelling(true)}
                >
                  Cancelar suscripción
                </Button>
              </div>
            </Card>
          ) : null}

          {state.kind === "cancelado" ? (
            <Card className="p-5">
              <h2 className="text-foreground flex items-center gap-2 font-semibold">
                Premium
                <Badge variant="neutral">Cancelada</Badge>
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Cancelaste tu suscripción. Vas a mantener el acceso
                {state.hasta ? ` hasta el ${formatTimestamp(state.hasta)}` : ""}
                .
              </p>
            </Card>
          ) : null}
        </div>
      )}

      {/*
        Abajo de la caja de estado y del precio, no arriba: quien ya decidió
        comprar tiene el botón sin scrollear, y quien no decidió encuentra
        acá el argumento. Va fuera del `if (soyTitular)` porque explica el
        producto —eso lo puede leer cualquiera del equipo—; lo que sigue
        siendo solo del titular son los controles de pago.

        Con Premium activo no se dibuja: el módulo ya está en el menú,
        desbloqueado, y venderle a alguien lo que acaba de comprar sobra.
      */}
      {!premium.activo ? <PremiumErpBenefits /> : null}

      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={handleCancel}
        loading={isPending}
        title="¿Cancelar la suscripción Premium?"
        description="Seguís teniendo Premium hasta el fin del período. A partir de ahí, Administración y Turnos quedan bloqueados y el resto de tus datos se conserva intacto."
        confirmLabel="Cancelar suscripción"
      />
    </div>
  );
}
