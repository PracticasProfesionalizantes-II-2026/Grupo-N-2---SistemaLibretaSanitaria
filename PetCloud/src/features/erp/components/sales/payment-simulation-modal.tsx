"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { QrPlaceholder } from "@/components/ui/qr-placeholder";

/**
 * El paso de cobro de una venta con tarjeta o transferencia.
 *
 * **Es una simulación, y el modal lo dice en la cara.** No hay posnet, no hay
 * pasarela, no se mueve un peso: lo único real que ocurre acá es el
 * `registerSale()` que el formulario dispara cuando este modal avisa que
 * siga. El aviso no está en un tooltip ni en letra chica al pie porque una
 * veterinaria que lee "Pago aprobado" y despacha la mercadería sin haber
 * cobrado pierde plata de verdad, y la culpa es de la pantalla que se lo hizo
 * creer. Una interfaz que afirma un cobro que no pasó es un error de
 * seguridad, no de diseño: mientras esto sea una maqueta, decirlo es parte
 * del comportamiento, no un adorno que se pueda sacar para que quede prolijo.
 *
 * El cobro de Premium (`features/vet/components/premium/`) tiene su propia
 * simulación, con su propio interruptor (`vet/lib/premium-simulation.ts`) y su
 * propio aviso en pantalla. Esto no comparte una sola línea con aquello, a
 * propósito: son dos cobros distintos, se apagan por separado, y uno puede
 * estar simulado mientras el otro no.
 *
 * Vive en su propio archivo y no dentro de `sale-form.tsx` porque el
 * formulario ya es largo y esto es una máquina de estados con temporizadores
 * propios: mezclados, cualquier cambio en uno obliga a releer el otro.
 *
 * Se monta y desmonta con el intento de cobro —el formulario lo renderiza
 * condicionalmente— y no se queda escondido con `open={false}`. Así el estado
 * interno arranca limpio en cada venta sin ningún efecto de reseteo: el
 * segundo cobro del día no hereda el "aprobado" del primero.
 */

/**
 * Cuánto tarda la terminal falsa en "aprobar".
 *
 * Dos segundos: alcanza para que el paso de "procesando" se vea y el modal no
 * parpadee, y no tanto como para que quien vende empiece a preguntarse si se
 * colgó. No es un número medido contra ninguna terminal real porque no hay
 * ninguna terminal real.
 */
const DEMORA_APROBACION_MS = 2000;

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

/** El paso de la simulación de tarjeta. La transferencia no la usa: ahí espera una persona. */
type FaseTarjeta = "procesando" | "aprobado";

/** Qué está haciendo el registro real de la venta, que es lo único que toca la base. */
type Envio = "inactivo" | "registrando" | "error";

export function PaymentSimulationModal({
  metodo,
  totalPesos,
  onCancelar,
  onConfirmar,
}: {
  metodo: "tarjeta" | "transferencia";
  totalPesos: number;
  /** Cerrar sin cobrar. El formulario conserva lo cargado: cancelar no es perder la venta. */
  onCancelar: () => void;
  /**
   * Registra la venta de verdad. Devuelve `true` si quedó guardada.
   *
   * La acción de servidor la llama el formulario y no este componente, a
   * propósito: acá se decide *cuándo* registrar, allá *qué* se registra. Así
   * este archivo no puede escribir en la base ni por accidente.
   */
  onConfirmar: () => Promise<boolean>;
}) {
  const [fase, setFase] = useState<FaseTarjeta>("procesando");
  const [envio, setEnvio] = useState<Envio>("inactivo");

  /**
   * Una venta por modal, pase lo que pase.
   *
   * El efecto de abajo depende de `onConfirmar`, y una identidad nueva de esa
   * función lo volvería a ejecutar: sin esta bandera, eso serían dos
   * `registerSale()` para un solo cobro, o sea dos ventas y dos descuentos de
   * stock. La bandera es un `ref` y no estado porque tiene que quedar puesta
   * *antes* de que React vuelva a renderizar, que es exactamente lo que el
   * estado no garantiza.
   */
  const yaRegistro = useRef(false);

  /**
   * La demora falsa de la terminal.
   *
   * El `clearTimeout` de la limpieza es lo que cumple la promesa de que
   * cerrar antes de tiempo no cobra: si el modal se desmonta mientras corre,
   * la aprobación nunca llega y `registerSale()` nunca se dispara.
   */
  useEffect(() => {
    if (metodo !== "tarjeta") return;

    const temporizador = setTimeout(
      () => setFase("aprobado"),
      DEMORA_APROBACION_MS,
    );

    return () => clearTimeout(temporizador);
  }, [metodo]);

  /**
   * Aprobada la simulación, recién ahí se registra la venta.
   *
   * Éste es el único camino por el que una venta con tarjeta llega a la base:
   * mientras la fase sea `procesando` no hay nada escrito, y si el modal se
   * cierra antes tampoco lo habrá.
   */
  useEffect(() => {
    if (metodo !== "tarjeta" || fase !== "aprobado") return;
    if (yaRegistro.current) return;

    yaRegistro.current = true;
    setEnvio("registrando");

    let vigente = true;

    void onConfirmar().then((registrada) => {
      // El formulario ya avisa el error con un `toast`; esto solo evita que el
      // modal se quede diciendo "registrando" para siempre cuando falla.
      if (vigente && !registrada) setEnvio("error");
    });

    return () => {
      vigente = false;
    };
  }, [metodo, fase, onConfirmar]);

  async function confirmarTransferencia() {
    if (yaRegistro.current) return;

    yaRegistro.current = true;
    setEnvio("registrando");

    const registrada = await onConfirmar();

    if (!registrada) {
      // Al contrario que en tarjeta, acá se puede reintentar sin rehacer la
      // simulación: quien cobró por transferencia ya tiene la plata, y
      // obligarlo a cerrar y recargar la venta entera por un error de red
      // sería castigarlo por un problema que no es suyo.
      yaRegistro.current = false;
      setEnvio("error");
    }
  }

  const registrando = envio === "registrando";

  return (
    <Modal
      open
      onClose={onCancelar}
      title={
        metodo === "tarjeta"
          ? "Cobro con tarjeta (simulación)"
          : "Cobro por transferencia (simulación)"
      }
      size="sm"
      footer={
        metodo === "transferencia" ? (
          <>
            <Button
              variant="outline"
              onClick={onCancelar}
              disabled={registrando}
            >
              Cancelar
            </Button>
            <Button onClick={confirmarTransferencia} disabled={registrando}>
              {registrando ? "Registrando…" : "Confirmar recepción de pago"}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onCancelar} disabled={registrando}>
            Cancelar
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {/*
          El aviso va arriba de todo y antes del "aprobado", no debajo: si
          aparece después del resultado, ya se leyó lo que no era cierto.
        */}
        <Alert variant="warning">
          <p className="font-semibold">Esto es una simulación.</p>
          <p className="mt-1">
            {metodo === "tarjeta"
              ? "No hay una terminal conectada: no se cobró nada con la tarjeta. Cobrá el importe por fuera del sistema antes de entregar la mercadería."
              : "El QR es una imagen de ejemplo y no recibe dinero. Confirmá solo cuando hayas verificado la transferencia en tu cuenta."}
          </p>
        </Alert>

        <p className="text-muted-foreground text-sm">
          Total a cobrar
          <span className="text-foreground ml-2 text-xl font-bold">
            {pesos.format(totalPesos)}
          </span>
        </p>

        {metodo === "transferencia" ? (
          <div className="flex flex-col items-center gap-2">
            <QrPlaceholder className="w-44" />
            <p className="text-muted-foreground text-xs">
              QR de ejemplo, sin datos de cobro.
            </p>
          </div>
        ) : fase === "procesando" ? (
          <p
            className="text-muted-foreground flex items-center gap-2 text-sm"
            aria-live="polite"
          >
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Procesando el pago…
          </p>
        ) : (
          <p
            className="text-success flex items-center gap-2 text-sm font-medium"
            aria-live="polite"
          >
            <CheckCircle2 className="size-4 shrink-0" />
            Pago aprobado en la simulación
            {registrando ? ". Registrando la venta…" : "."}
          </p>
        )}

        {envio === "error" ? (
          <Alert variant="danger">
            No pudimos registrar la venta. El detalle está en el aviso de arriba
            de la pantalla.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}
