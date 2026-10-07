"use client";

import { PenLine } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { registerVetSignature } from "@/features/vet/actions/signature-actions";
import { SignaturePad } from "@/features/vet/components/settings/signature-pad";
import type { UltimaRevisionMatricula } from "@/features/vet/data/license-review";
import type { FirmaRegistrada } from "@/features/vet/data/signatures";
import { DECLARACION_JURADA } from "@/features/vet/lib/firma-declaracion";
import { fechaArgentina } from "@/lib/argentina-time";

/**
 * La sección de firma digital de Ajustes.
 *
 * Reemplaza al `<input type="file">` que solo mostraba un `toast.success` y no
 * escribía en ningún lado.
 *
 * Tres estados, y ninguno es un control muerto —la especificación del proyecto lo
 * pide así: siempre el motivo, nunca un botón apagado sin explicación—:
 *
 *   · **Recepción**: no ejerce con matrícula, así que la sección no le aplica y
 *     lo dice. Es la misma forma que tomó el modal de permisos cuando dejó de
 *     fingir que guardaba.
 *   · **Matrícula en validación**: la política de INSERT de `vet_signatures`
 *     exige `is_validated_vet()`, así que registrar ahora fallaría en la base.
 *     Se explica antes de que la persona abra el formulario.
 *   · **Profesional validado**: un botón abre el modal con la aclaración, la
 *     matrícula, la declaración jurada y —si quiere— el lienzo.
 *
 * El dibujo es OPCIONAL desde la migración 067: el primer veterinario real que
 * probó el sistema no quería dibujar, y no hay ninguna razón de seguridad para
 * exigirlo — `insertarFirma()` ya sabía renderizar sin imagen desde antes de
 * que existiera esta tabla. Lo que la declaración jurada certifica es la
 * identidad de quien firma, no el trazo.
 *
 * El formulario vive en un modal y no en la página, porque el lienzo de
 * 640 × 240 hacía que la sección entera dominara Ajustes incluso para
 * cualquiera que solo quería mirar su firma vigente.
 *
 * El historial se muestra entero, con fechas: es lo que responde qué firma
 * estaba vigente cuando se firmó un documento.
 */

type Props = {
  firmas: FirmaRegistrada[];
  rolEnInstitucion: string;
  licenciaValidada: boolean;
  /** Último rechazo de la matrícula, para que el motivo llegue a la persona. */
  rechazo?: UltimaRevisionMatricula | null;
  matricula: string | null;
  nombre: string;
};

/** Mismo criterio de formateo que `premium-view.tsx` y `audit-log-view.tsx`. */
function formatTimestamp(iso: string) {
  return fechaArgentina(iso, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function FirmaImagen({
  firma,
  alto,
}: {
  firma: FirmaRegistrada;
  alto: number;
}) {
  if (!firma.url) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin dibujo. La firma es válida igual: la aclaración y la matrícula la
        respaldan.
      </p>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de un bucket privado: el optimizador de Next no puede cachearla y el enlace vence en minutos
    <img
      src={firma.url}
      alt={`Firma de ${firma.aclaracion}`}
      className="w-auto max-w-full"
      style={{ maxHeight: alto }}
    />
  );
}

function FormularioFirma({
  nombre,
  matricula,
  hayVigente,
  onRegistrada,
}: {
  nombre: string;
  matricula: string | null;
  hayVigente: boolean;
  onRegistrada: () => void;
}) {
  const [imagen, setImagen] = useState<Blob | null>(null);
  const [aclaracion, setAclaracion] = useState(nombre);
  const [matriculaForm, setMatriculaForm] = useState(matricula ?? "");
  const [declaracion, setDeclaracion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const enviar = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setError(null);

    const formData = new FormData();
    // Solo se adjunta si hay dibujo: mandar un blob vacío haría que la acción
    // lo tratara como un archivo real de tamaño 0.
    if (imagen) formData.append("imagen", imagen, "firma.png");
    formData.append("aclaracion", aclaracion);
    formData.append("matricula", matriculaForm);
    formData.append("declaracion", String(declaracion));

    iniciar(async () => {
      const resultado = await registerVetSignature(formData);

      if (!resultado.success) {
        setError(resultado.error);
        return;
      }

      setDeclaracion(false);
      setImagen(null);
      toast.success("Firma registrada.");
      onRegistrada();
    });
  };

  return (
    <form noValidate className="space-y-4" onSubmit={enviar}>
      <SignaturePad onDibujoChange={setImagen} deshabilitado={enviando} />
      <p className="text-muted-foreground -mt-2 text-xs">
        Opcional. Podés registrar tu firma solo con la aclaración y la
        matrícula, sin dibujar nada acá.
      </p>

      <Field
        label="Aclaración"
        htmlFor="firma-aclaracion"
        hint="Como va debajo de tu firma. Puede diferir del nombre de la cuenta."
        required
      >
        <Input
          id="firma-aclaracion"
          value={aclaracion}
          maxLength={120}
          onChange={(evento) => setAclaracion(evento.target.value)}
        />
      </Field>

      <Field label="Matrícula" htmlFor="firma-matricula" required>
        <Input
          id="firma-matricula"
          value={matriculaForm}
          maxLength={60}
          onChange={(evento) => setMatriculaForm(evento.target.value)}
        />
      </Field>

      <label
        htmlFor="firma-declaracion"
        className="border-border flex items-start gap-3 rounded-lg border p-3 text-sm"
      >
        <Checkbox
          id="firma-declaracion"
          checked={declaracion}
          onChange={(evento) => setDeclaracion(evento.target.checked)}
        />
        <span className="text-muted-foreground">{DECLARACION_JURADA}</span>
      </label>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar firma"}
        </Button>
      </div>

      {hayVigente ? (
        <p className="text-muted-foreground text-xs">
          Una firma nueva no borra la anterior: la reemplaza. Todo lo que ya
          firmaste sigue mostrando la firma con la que se firmó.
        </p>
      ) : null}
    </form>
  );
}

export function SignatureSection({
  firmas,
  rolEnInstitucion,
  licenciaValidada,
  rechazo = null,
  matricula,
  nombre,
}: Props) {
  const vigente = firmas.find((firma) => firma.reemplazadaEl === null) ?? null;
  const historial = firmas.filter((firma) => firma.reemplazadaEl !== null);

  const esRecepcion = rolEnInstitucion === "assistant";

  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <Card className="p-5">
      <h2 className="text-foreground flex items-center gap-2 font-semibold">
        <PenLine className="size-5" />
        Firma digital
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Se estampa en cada consulta, vacunación y certificado que firmes, y
        queda congelada en lo que ya firmaste.
      </p>

      {esRecepcion ? (
        <Alert variant="info" className="mt-4">
          La firma es de quien ejerce con matrícula. Tu cuenta es de recepción,
          así que esta sección no aplica.
        </Alert>
      ) : (
        <>
          {vigente ? (
            <div className="border-border bg-muted mt-4 rounded-lg border p-4">
              <p className="text-muted-foreground text-xs font-semibold uppercase">
                Firma vigente
              </p>
              <div className="mt-3">
                <FirmaImagen firma={vigente} alto={90} />
              </div>
              <p className="text-foreground mt-3 text-sm font-medium">
                {vigente.aclaracion}
              </p>
              <p className="text-muted-foreground text-xs">
                Matrícula {vigente.matricula} · registrada el{" "}
                {formatTimestamp(vigente.creadaEl)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Declaración jurada aceptada el{" "}
                {formatTimestamp(vigente.juradaEl)}
              </p>
            </div>
          ) : (
            <Alert variant="warning" className="mt-4">
              Todavía no cargaste tu firma. Sin ella podés guardar borradores
              pero no firmar registros.
            </Alert>
          )}

          {licenciaValidada ? (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalAbierto(true)}
              >
                {vigente ? "Modificar firma" : "Registrar firma"}
              </Button>
            </div>
          ) : rechazo ? (
            <Alert variant="danger" className="mt-4">
              <span>
                <strong>No pudimos validar tu matrícula.</strong> PetCloud
                revisó tus datos el {formatTimestamp(rechazo.fecha)}
                {rechazo.nota ? (
                  <> y dejó este motivo: “{rechazo.nota}”</>
                ) : null}
                . Corregí lo que haga falta y escribinos a soporte para que la
                volvamos a revisar.
              </span>
            </Alert>
          ) : (
            <Alert variant="warning" className="mt-4">
              Tu matrícula todavía está en validación. Vas a poder registrar tu
              firma cuando PetCloud confirme tus datos con el colegio
              profesional.
            </Alert>
          )}

          <Modal
            open={modalAbierto}
            onClose={() => setModalAbierto(false)}
            title={vigente ? "Modificar firma" : "Registrar tu firma"}
            description="La aclaración y la matrícula son obligatorias. El dibujo es opcional."
          >
            <FormularioFirma
              nombre={nombre}
              matricula={matricula}
              hayVigente={vigente !== null}
              onRegistrada={() => setModalAbierto(false)}
            />
          </Modal>

          {historial.length > 0 ? (
            <div className="border-border mt-6 border-t pt-4">
              <p className="text-muted-foreground text-xs font-semibold uppercase">
                Firmas anteriores
              </p>
              <ul className="mt-3 space-y-4">
                {historial.map((firma) => (
                  <li key={firma.id} className="flex items-start gap-4">
                    <div className="shrink-0">
                      <FirmaImagen firma={firma} alto={48} />
                    </div>
                    <div className="text-sm">
                      <p className="text-foreground font-medium">
                        {firma.aclaracion}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Matrícula {firma.matricula} · vigente del{" "}
                        {formatTimestamp(firma.creadaEl)}
                        {firma.reemplazadaEl
                          ? ` al ${formatTimestamp(firma.reemplazadaEl)}`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
