"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getCertificateContext,
  saveCertificate,
} from "@/features/vet/actions/certificate-actions";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import { SignatureStatus } from "@/features/vet/components/shared/signature-status";
import { motivoSinFirma } from "@/features/vet/lib/puede-firmar";
import { generarCertificadoPdf } from "@/features/vet/lib/certificate-pdf";
import { downloadBlob } from "@/lib/export";
import { formatLongDate } from "@/lib/format";
import type { Patient } from "@/types/vet";
import { hoyArgentina } from "@/lib/argentina-time";

const CERTIFICATE_TYPES = [
  { value: "salud", label: "Certificado de salud" },
  { value: "vacunacion", label: "Certificado de vacunación" },
  { value: "viaje", label: "Certificado de tránsito / viaje" },
  { value: "castracion", label: "Certificado de castración" },
];

export function CertificateModal({
  open,
  onClose,
  patient,
  ownerName,
}: {
  open: boolean;
  onClose: () => void;
  patient: Patient;
  ownerName?: string;
}) {
  const vet = useVetSession();
  const [type, setType] = useState("salud");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  // Un certificado sanitario vale por la matrícula que lo firma, así que lo
  // emite quien tiene la sesión abierta. Elegir a un colega de una lista sería
  // firmar a su nombre sin que se entere.
  //
  // Desde el portón de la `065` también pide firma cargada: sin ella el trigger
  // `enforce_certificate_requires_signature` rechaza la fila, y el PDF ya
  // estaría subido al bucket. Mejor apagar el botón con el motivo a la vista.
  const motivo = motivoSinFirma(vet);

  const hoy = hoyArgentina();

  const etiquetaTipo =
    CERTIFICATE_TYPES.find((item) => item.value === type)?.label ??
    "Certificado";

  /**
   * Emitir el certificado.
   *
   * El PDF se arma acá, en el navegador: la firma del profesional llega como
   * URL temporal y descargarla del lado del cliente evita tener que mover la
   * imagen por el servidor. Después se guarda en los documentos de la mascota
   * —que es lo que el modal le promete al profesional— y recién ahí se le
   * descarga la copia para imprimir.
   */
  async function handleGenerate() {
    setGenerating(true);

    try {
      const contexto = await getCertificateContext(patient.id);

      if (!contexto) {
        toast.error("No pudimos leer los datos del paciente.");
        return;
      }

      const titulo = `${etiquetaTipo} - ${patient.nombre}`;

      const blob = await generarCertificadoPdf({
        tipo: etiquetaTipo,
        emitidoEl: hoy,
        observaciones: notes,
        mascota: contexto.mascota,
        dueno: contexto.dueno,
        profesional: contexto.profesional,
        institucion: contexto.institucion,
      });

      const formData = new FormData();
      formData.set("titulo", titulo);
      formData.set(
        "archivo",
        new File([blob], `${titulo}.pdf`, { type: "application/pdf" }),
      );

      const resultado = await saveCertificate(patient.id, formData);

      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }

      // La copia para imprimir se descarga después de guardar: si el guardado
      // falla, el profesional no se queda con un PDF en la mano creyendo que
      // el dueño ya lo tiene en sus documentos.
      downloadBlob(`${titulo}.pdf`, blob);

      toast.success(
        `${etiquetaTipo} de ${patient.nombre} firmado y guardado en sus documentos.`,
      );
      onClose();
    } catch {
      toast.error("No pudimos generar el certificado. Probá de nuevo.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generar certificado"
      description={`Se emite a nombre de ${ownerName ?? "el dueño"} y queda en los documentos de ${patient.nombre}.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || motivo !== null}
          >
            {generating ? "Generando..." : "Firmar y generar PDF"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Tipo de certificado" htmlFor="tipo-certificado" required>
          <Select
            id="tipo-certificado"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {CERTIFICATE_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="text-muted-foreground text-xs font-semibold uppercase">
            Profesional que firma
          </p>
          <p className="text-foreground mt-1 font-medium">
            {[vet?.usuario.nombre, vet?.usuario.apellido]
              .filter(Boolean)
              .join(" ")}
          </p>
          <p className="text-muted-foreground text-sm">{vet?.matricula}</p>
        </div>

        <Field
          label="Observaciones"
          htmlFor="observaciones-certificado"
          hint="Opcional. Se imprimen en el cuerpo del certificado."
        >
          <Textarea
            id="observaciones-certificado"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        <SignatureStatus motivo={motivo} />

        <Alert variant="info">
          El certificado se emite con fecha {formatLongDate(hoy)} y queda
          disponible para el dueño en la sección Documentos de {patient.nombre}.
        </Alert>
      </div>
    </Modal>
  );
}
