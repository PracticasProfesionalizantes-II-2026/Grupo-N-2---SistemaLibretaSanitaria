"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import {
  rejectVetLicense,
  validateVetLicense,
} from "@/features/admin/actions/license-actions";
import type { LicenseRequest } from "@/features/admin/data/licenses";
import {
  PLAZO_REVISION_HORAS,
  antiguedadSolicitud,
  superaPlazo,
} from "@/features/admin/lib/request-age";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Cola de validación de matrículas.
 *
 * Es el control que hace que la firma digital signifique algo: hasta que acá se
 * apruebe, el profesional puede cargar atenciones pero no firmarlas — lo exige
 * el trigger `enforce_signature_requires_license()` (009), no esta pantalla.
 *
 * Tres estados y no cuatro: la maqueta anterior tenía además "información
 * solicitada", que no existe en la base —`license_validated` es booleano— y
 * mostrarlo habría sido inventar un estado que ningún dato respalda. Pedir
 * información es, hoy, un rechazo con el motivo explicado; el profesional
 * corrige y la solicitud vuelve a la cola.
 *
 * QUÉ SE VE Y QUÉ NO: no hay archivo de matrícula adjunto en este ciclo. La
 * decisión se toma contra el número y los datos del profesional, y la
 * verificación real se hace por fuera, contra el registro del colegio. El
 * aviso de arriba lo dice en pantalla en vez de dejar que alguien suponga que
 * el sistema verificó algo.
 */
/** Solo se revoca lo ya aprobado; en la cola siempre es aprobar o rechazar. */
function esRevocacion(solicitud: LicenseRequest) {
  return solicitud.revisadaEl !== null && solicitud.validada;
}

export function ValidationsView({
  solicitudes,
}: {
  solicitudes: LicenseRequest[];
}) {
  const [tab, setTab] = useState<"cola" | "historial">("cola");
  const [rechazando, setRechazando] = useState<LicenseRequest | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  const cola = solicitudes.filter((item) => item.revisadaEl === null);
  // Una sola referencia de "ahora" por render: todas las tarjetas miden contra
  // el mismo instante.
  const [ahora] = useState(() => new Date());
  const vencidas = cola.filter((item) => superaPlazo(item.solicitadaAt, ahora));
  const historial = solicitudes.filter((item) => item.revisadaEl !== null);
  const lista = tab === "cola" ? cola : historial;

  function aprobar(solicitud: LicenseRequest) {
    startTransition(async () => {
      const resultado = await validateVetLicense(solicitud.professionalId);

      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }

      toast.success(`Matrícula de ${solicitud.nombre} validada.`);
    });
  }

  function rechazar() {
    if (!rechazando) return;
    const solicitud = rechazando;

    startTransition(async () => {
      const resultado = await rejectVetLicense(
        solicitud.professionalId,
        motivo,
      );

      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }

      toast.success(`Solicitud de ${solicitud.nombre} rechazada.`);
      setRechazando(null);
      setMotivo("");
    });
  }

  return (
    <>
      <PageHeader
        title="Validaciones"
        description="Matrículas profesionales pendientes de revisión."
      />

      <Alert variant="info">
        La matrícula se verifica por fuera del sistema, contra el registro del
        colegio profesional. PetCloud no guarda el documento: acá se registra la
        decisión y queda auditada. Antes de aprobar, buscá el número de
        matrícula en el registro público del colegio de la jurisdicción del
        profesional y confirmá que el nombre coincida.
      </Alert>

      {vencidas.length > 0 ? (
        <Alert variant="warning" className="mt-4">
          <strong>
            {vencidas.length === 1
              ? "1 solicitud lleva"
              : `${vencidas.length} solicitudes llevan`}{" "}
            más de {PLAZO_REVISION_HORAS} horas esperando.
          </strong>{" "}
          En el sitio prometemos revisarlas en menos de {PLAZO_REVISION_HORAS}{" "}
          horas.
        </Alert>
      ) : null}

      <div className="border-border mt-6 flex gap-1 border-b">
        {(
          [
            ["cola", `Cola (${cola.length})`],
            ["historial", `Historial (${historial.length})`],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setTab(valor)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium",
              tab === valor
                ? "border-brand-500 text-brand-700"
                : "text-muted-foreground border-transparent",
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {tab === "historial" && historial.length > 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          El historial cuenta todas las matrículas que ya no están pendientes,
          incluidas las que se validaron antes de que existiera esta pantalla.
          En Logs aparecen solo las decisiones tomadas desde acá, por eso los
          números pueden no coincidir.
        </p>
      ) : null}

      {lista.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={
            tab === "cola"
              ? "No hay solicitudes pendientes"
              : "Todavía no resolviste ninguna"
          }
          description={
            tab === "cola"
              ? "Cuando una veterinaria se registre, su matrícula va a aparecer acá."
              : "Las solicitudes que apruebes o rechaces quedan en este historial."
          }
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {lista.map((solicitud) => (
            <li key={solicitud.professionalId}>
              <Card className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-foreground font-medium">
                      {solicitud.nombre}
                    </p>
                    {solicitud.revisadaEl === null ? (
                      <>
                        <Badge variant="warning">Pendiente</Badge>
                        {superaPlazo(solicitud.solicitadaAt, ahora) ? (
                          <Badge variant="danger">
                            Más de {PLAZO_REVISION_HORAS} h
                          </Badge>
                        ) : null}
                      </>
                    ) : solicitud.validada ? (
                      <Badge variant="success">Aprobada</Badge>
                    ) : (
                      <Badge variant="danger">Rechazada</Badge>
                    )}
                  </div>

                  <p className="text-muted-foreground mt-1 text-sm">
                    {solicitud.matricula} · {solicitud.institucionNombre}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {solicitud.email} · solicitada el{" "}
                    {formatLongDate(solicitud.solicitadaEl)}
                    {solicitud.revisadaEl === null ? (
                      <>
                        {" "}
                        ·{" "}
                        <span
                          className={cn(
                            superaPlazo(solicitud.solicitadaAt, ahora) &&
                              "text-danger font-semibold",
                          )}
                        >
                          {antiguedadSolicitud(solicitud.solicitadaAt, ahora)}
                        </span>
                      </>
                    ) : null}
                  </p>

                  {solicitud.ultimaNota ? (
                    <p className="text-muted-foreground mt-2 text-sm italic">
                      “{solicitud.ultimaNota}”
                    </p>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  {/*
                    Pendiente = `revisadaEl === null`, sin importar
                    `validada`: una fila validada por fuera del panel (seed,
                    demo) pero nunca revisada también va a la cola, y ahí
                    corresponde aprobar o rechazar, no revocar. Revocar es solo
                    para lo ya aprobado desde el historial.
                  */}
                  {esRevocacion(solicitud) ? null : (
                    <Button
                      size="sm"
                      disabled={pendiente}
                      onClick={() => aprobar(solicitud)}
                    >
                      <Check className="size-4" />
                      Aprobar
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendiente}
                    onClick={() => {
                      setRechazando(solicitud);
                      setMotivo("");
                    }}
                  >
                    <X className="size-4" />
                    {esRevocacion(solicitud) ? "Revocar" : "Rechazar"}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={rechazando !== null}
        onClose={() => setRechazando(null)}
        title={
          rechazando && esRevocacion(rechazando)
            ? "Revocar la matrícula"
            : "Rechazar la solicitud"
        }
        description={
          rechazando && esRevocacion(rechazando)
            ? "El profesional deja de poder firmar registros clínicos y sale del directorio de guardias."
            : "El profesional va a leer el motivo en Configuración, en la sección Firma digital."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setRechazando(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={rechazar}
              disabled={pendiente || motivo.trim().length === 0}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <Field
          label="Motivo"
          htmlFor="motivo-rechazo"
          hint="Contá qué tiene que corregir. Lo va a leer el profesional."
          required
        >
          <Textarea
            id="motivo-rechazo"
            value={motivo}
            maxLength={500}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="El número de matrícula no figura en el registro del colegio."
          />
        </Field>
      </Modal>
    </>
  );
}
