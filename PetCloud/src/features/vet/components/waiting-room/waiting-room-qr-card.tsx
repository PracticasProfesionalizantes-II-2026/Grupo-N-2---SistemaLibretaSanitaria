"use client";

import { Download, Printer, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QrPlaceholder } from "@/components/ui/qr-placeholder";
import type { WaitingRoomQrSession } from "@/features/vet/actions/waiting-room-qr-actions";
import { downloadBlob } from "@/lib/export";
import { crearDocumento } from "@/lib/pdf/documento";
import { ZONA } from "@/lib/argentina-time";
import { cn } from "@/lib/utils";

function formatVencimiento(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * QR de la sala de espera: para imprimir en el mostrador y que cualquier
 * dueño se anote solo con el celular, sin pasar por la recepción.
 *
 * El QR se arma en el navegador con `qrcode`, el PDF con
 * `crearDocumento`/jsPDF. La URL pública es `/visitas/ingreso/{code}`.
 */
export function WaitingRoomQrCard({
  session,
  siteUrl,
  emitiendo,
  revocando,
  onEmit,
  onRevoke,
}: {
  session: WaitingRoomQrSession | null;
  siteUrl: string;
  emitiendo: boolean;
  revocando: boolean;
  onEmit: () => void;
  onRevoke: (sessionId: string) => void;
}) {
  // La imagen queda pegada a la URL con la que
  // se generó, para que un cambio de sesión mientras `QRCode.toDataURL`
  // todavía está resolviendo nunca deje una imagen vieja bajo un código nuevo.
  const [qrImageFetched, setQrImageFetched] = useState<{
    url: string;
    dataUrl: string;
  } | null>(null);

  const publicUrl = session
    ? `${siteUrl}/visitas/ingreso/${session.code}`
    : null;

  const qrImage =
    qrImageFetched?.url === publicUrl ? qrImageFetched.dataUrl : null;

  useEffect(() => {
    if (!publicUrl) return;

    let vigente = true;

    QRCode.toDataURL(publicUrl, { width: 480, margin: 1 }).then((dataUrl) => {
      if (vigente) setQrImageFetched({ url: publicUrl, dataUrl });
    });

    return () => {
      vigente = false;
    };
  }, [publicUrl]);

  const vencido = session ? new Date(session.validoHasta) <= new Date() : false;

  async function handleDownloadPng() {
    if (!qrImage) return;

    const blob = await (await fetch(qrImage)).blob();
    downloadBlob("qr-sala-de-espera.png", blob);
    toast.success("Se descargó el QR en PNG.");
  }

  function handleDownloadPdf() {
    if (!qrImage || !session || !publicUrl) return;

    const pdf = crearDocumento();
    pdf.encabezado(
      "QR de la sala de espera",
      `Válido hasta ${formatVencimiento(session.validoHasta)}`,
    );

    const tamano = 80;
    const x = (pdf.ancho - tamano) / 2;
    pdf.doc.addImage(qrImage, "PNG", x, pdf.y, tamano, tamano);
    pdf.y += tamano + 8;

    pdf.doc.setFont("helvetica", "normal");
    pdf.doc.setFontSize(10);
    pdf.doc.text(publicUrl.replace(/^https?:\/\//, ""), pdf.ancho / 2, pdf.y, {
      align: "center",
    });

    downloadBlob("qr-sala-de-espera.pdf", pdf.blob());
    toast.success("Se generó el PDF para imprimir.");
  }

  return (
    <Card className="flex flex-col items-center gap-4 p-5">
      <h2 className="text-foreground self-start font-semibold">
        QR de autogestión
      </h2>
      <p className="text-muted-foreground self-start text-sm">
        Un dueño que lo escanea desde su celular se anota solo en la cola, sin
        pasar por el mostrador.
      </p>

      {session && qrImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrImage} alt="QR de la sala de espera" className="w-48" />
      ) : (
        <QrPlaceholder className="w-48" />
      )}

      {session ? (
        <div className="text-center">
          <p className="text-muted-foreground font-mono text-sm">
            {session.code}
          </p>
          <p
            className={cn(
              "mt-1 text-xs",
              vencido ? "text-danger" : "text-muted-foreground",
            )}
          >
            {vencido ? "Venció el" : "Válido hasta el"}{" "}
            {formatVencimiento(session.validoHasta)}
          </p>
        </div>
      ) : (
        <Alert variant="info">
          Todavía no emitiste el QR de la sala de espera. Los dueños lo
          necesitan para anotarse solos desde su celular.
        </Alert>
      )}

      <div className="grid w-full grid-cols-1 gap-2">
        <Button variant="outline" disabled={emitiendo} onClick={onEmit}>
          <RefreshCw className="size-4" />
          {emitiendo ? "Emitiendo…" : session ? "Reemitir QR" : "Emitir QR"}
        </Button>
        <Button
          variant="outline"
          disabled={!qrImage}
          onClick={handleDownloadPng}
        >
          <Download className="size-4" />
          Descargar PNG
        </Button>
        <Button
          variant="outline"
          disabled={!qrImage}
          onClick={handleDownloadPdf}
        >
          <Printer className="size-4" />
          PDF para imprimir
        </Button>
        {session ? (
          <Button
            variant="ghost"
            className="text-danger"
            disabled={revocando}
            onClick={() => onRevoke(session.id)}
          >
            <XCircle className="size-4" />
            {revocando ? "Revocando…" : "Revocar QR"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
