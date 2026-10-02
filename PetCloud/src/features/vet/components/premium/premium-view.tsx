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
import { simulatePremiumCheckout } from "@/features/vet/actions/premium-simulation-actions";
import {
  cancelPremium,
  startPremiumCheckout,
} from "@/features/vet/actions/subscription-actions";
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
  checkoutSimulado,
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
  /**
   * Si el alta resuelve con el checkout simulado en vez de Mercado Pago. Lo
   * decide el servidor (`lib/premium-simulation.ts`) y baja desde la página:
   * acá no se puede leer `process.env`, y tampoco debería poder — el modo de
   * cobro no es una preferencia del navegador.
   *
   * Cambia dos cosas visibles: a dónde va el botón de alta, y el aviso de que
   * no se cobró nada. Lo segundo no es opcional ni decorativo: una pantalla
   * que afirma un pago que no ocurrió es la forma más cara de equivocarse.
   */
  checkoutSimulado: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);

  const state = resolveViewState(premium, subscription, price);
  const badge = ESTADO_BADGE[state.kind];

  /** Con el checkout simulado no se redirige a ningún lado: se procesa acá. */
  const etiquetaEnCurso = checkoutSimulado
    ? "Procesando el pago simulado…"
    : "Redirigiendo a Mercado Pago...";

  /**
   * El alta, por el camino que corresponda.
   *
   * La bifurcación vive acá y en ningún otro lado: la máquina de estados, los
   * textos y el resto de la pantalla son los mismos para los dos modos. El
   * simulado no redirige a ninguna parte porque no hay adónde ir a pagar; al
   * volver, la revalidación del layout ya trae la sesión con Premium activo y
   * la pantalla se reacomoda sola.
   */
  function handleCheckout() {
    startTransition(async () => {
      if (checkoutSimulado) {
        const simulado = await simulatePremiumCheckout();

        if (!simulado.success) {
          toast.error(simulado.error);
          return;
        }

        toast.success(
          "Premium quedó activo. Fue un checkout simulado: no se cobró nada.",
        );
        return;
      }

      const result = await startPremiumCheckout();

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      window.location.href = result.initPoint;
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelPremium();

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setCancelling(false);
      toast.success(
        "Le pedimos a Mercado Pago que cancele la suscripción. El cambio se refleja acá apenas Mercado Pago lo confirme.",
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
          {checkoutSimulado ? (
            <Alert variant="warning">
              <p className="font-semibold">
                El cobro de Premium está simulado.
              </p>
              <p className="mt-1">
                {premium.activo
                  ? "Premium se activó sin pasar por Mercado Pago: no se cobró nada y no hay ninguna suscripción real detrás. La facturación de verdad se habilita cuando se vuelva a activar el cobro."
                  : "Suscribirse acá no pasa por Mercado Pago y no cobra nada: activa el módulo al instante, para probar y demostrar el producto."}
              </p>
            </Alert>
          ) : null}

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
                {isPending ? etiquetaEnCurso : "Suscribirme"}
              </Button>
            </Card>
          ) : null}

          {state.kind === "pendiente" ? (
            <Alert variant="info">
              Tu pago está en proceso. Te avisamos acá apenas Mercado Pago lo
              confirme — todavía no activamos Premium.
            </Alert>
          ) : null}

          {state.kind === "rechazado" ? (
            <Alert variant="danger">
              <p>Mercado Pago rechazó el pago. Podés volver a intentarlo.</p>
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
                  {isPending ? etiquetaEnCurso : "Suscribirme"}
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
                      ? checkoutSimulado
                        ? // Sin cobro real no hay "próximo cobro" que anunciar:
                          // decirlo igual sería inventar un movimiento de dinero
                          // que no existe. Lo único cierto es hasta cuándo dura
                          // el acceso que la simulación otorgó.
                          `Acceso simulado${
                            state.hasta
                              ? ` hasta el ${formatTimestamp(state.hasta)}`
                              : ""
                          }, sin cobro asociado.`
                        : `Próximo cobro${subscription ? `: ${formatARS(subscription.amountCents)}` : ""}${
                            state.hasta
                              ? ` el ${formatTimestamp(state.hasta)}`
                              : ""
                          }.`
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
        description="Mercado Pago confirma la baja por su cuenta: seguís teniendo Premium hasta que llegue esa confirmación. A partir de ahí, Administración y Turnos quedan bloqueados y el resto de tus datos se conserva intacto."
        confirmLabel="Cancelar suscripción"
      />
    </div>
  );
}
