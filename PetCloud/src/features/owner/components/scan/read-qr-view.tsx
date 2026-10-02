"use client";

import { QrCode, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { QrCameraScanner } from "@/components/ui/qr-camera-scanner";
import { classifyScannedCode, type ScannedCode } from "@/lib/qr-code";

/**
 * Reads a PetCloud QR — a pet's collar, or a clinic's waiting-room QR.
 *
 * No query is needed here: `classifyScannedCode()` (`lib/qr-code.ts`)
 * distinguishes the code's format as soon as it's read, and this screen only
 * routes — to the collar (`/p/[qrCode]`, the same public profile anyone who
 * scans it sees) or to the waiting-room check-in
 * (`/visitas/ingreso/[code]`). Neither screen lives in here.
 */
export function ReadQrView() {
  const router = useRouter();
  const [manualCode, setManualCode] = useState("");
  const [errorManual, setErrorManual] = useState<string>();
  const [errorEscaneo, setErrorEscaneo] = useState(false);

  function enrutar(codigo: ScannedCode | null) {
    if (!codigo) return false;

    // `switch` exhaustivo: asignar `codigo` a un `never` hace que una variante
    // nueva de `ScannedCode` sin su propio `case` sea un error de compilación,
    // no un bug en producción.
    switch (codigo.tipo) {
      case "collar": {
        router.push(`/p/${codigo.codigo}`);
        break;
      }
      case "sala": {
        router.push(`/visitas/ingreso/${codigo.codigo}`);
        break;
      }
      default: {
        const _exhaustivo: never = codigo;
        return _exhaustivo;
      }
    }

    return true;
  }

  function handleScan(texto: string) {
    if (!enrutar(classifyScannedCode(texto))) {
      setErrorEscaneo(true);
      return;
    }

    setErrorEscaneo(false);
  }

  function handleManual() {
    if (!enrutar(classifyScannedCode(manualCode))) {
      setErrorManual(
        "Ese código no tiene el formato PC-XXXX-XXXX (collar) ni PCW-XXXX-XXXX-XXXX (sala de espera).",
      );
      return;
    }

    setErrorManual(undefined);
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Leer QR"
        description="Escaneá el collar de una mascota para ver su ficha, o el QR de la sala de espera de una veterinaria para anotarte."
        breadcrumbs={[{ label: "Leer QR" }]}
      />

      <Card className="p-5">
        <h2 className="text-foreground flex items-center gap-2 font-semibold">
          <QrCode className="text-brand-600 size-[18px]" />
          Cámara
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Apuntá al QR del collar o al de la sala de espera.
        </p>

        <QrCameraScanner onDecode={handleScan} className="mt-5" />

        {errorEscaneo ? (
          <Alert variant="warning" className="mt-4">
            Eso que leíste no es un código de PetCloud. Probá de nuevo o ingresá
            el código a mano.
          </Alert>
        ) : null}

        <div className="border-border mt-5 border-t pt-5">
          <Field
            label="O ingresá el código a mano"
            htmlFor="codigo-qr-dueno"
            hint="El del collar tiene el formato PC-XXXX-XXXX; el de la sala de espera, PCW-XXXX-XXXX-XXXX."
            error={errorManual}
          >
            <div className="flex gap-2">
              <Input
                id="codigo-qr-dueno"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="PC-8F3A-2K9D"
                className="uppercase"
              />
              <Button
                variant="outline"
                onClick={handleManual}
                disabled={!manualCode.trim()}
              >
                <Search className="size-4" />
                Buscar
              </Button>
            </div>
          </Field>
        </div>
      </Card>
    </div>
  );
}
