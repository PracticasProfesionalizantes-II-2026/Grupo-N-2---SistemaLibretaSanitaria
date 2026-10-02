"use client";

import { Camera, CameraOff, ShieldAlert, SquareDashed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type QrScannerType from "qr-scanner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Estado =
  "inactiva" | "pidiendo-permiso" | "escaneando" | "sin-permiso" | "sin-camara";

const COPY: Record<Exclude<Estado, "escaneando">, string> = {
  inactiva: 'Presioná "Activar cámara" para empezar.',
  "pidiendo-permiso": "Pidiendo permiso de cámara…",
  "sin-permiso":
    "No dejaste usar la cámara. Activala desde los permisos del sitio en tu navegador, o usá el código a mano.",
  "sin-camara": "No encontramos una cámara disponible. Usá el código a mano.",
};

/**
 * Lector de QR con cámara en vivo, compartido entre el escaneo de la
 * veterinaria y el del dueño — ambos leen la misma credencial de collar, así
 * que la mecánica de la cámara es una sola.
 *
 * `qr-scanner` (nimiq) se precarga en un `useEffect` —no al importar el
 * archivo, que rompería el render del server: la librería toca
 * `navigator`/`OffscreenCanvas` apenas se ejecuta— pero SÍ antes de que
 * alguien apriete "Activar cámara", no recién en el handler del click. Es la
 * diferencia entre que Safari en iOS trate el pedido de cámara como parte
 * directa del toque de la persona o no: un `await import(...)` adentro del
 * handler, antes de llamar a `getUserMedia`, alcanza para que WebKit ya no
 * lo considere un gesto del usuario y lo descarte en silencio — sin
 * excepción que atajar, sin permiso pedido, la cámara simplemente no
 * arranca. Precargando el módulo al montar, el click ya tiene todo listo y
 * `start()` dispara `getUserMedia` en el mismo tick del toque.
 *
 * Se apaga sola después de un código leído: la pantalla que la usa decide qué
 * hacer con el resultado, y dejar la cámara prendida apuntando a un QR que ya
 * se resolvió no suma nada — solo consume batería y encima preocupa por la
 * privacidad de tener una cámara abierta de más.
 */
export function QrCameraScanner({
  onDecode,
  className,
}: {
  onDecode: (texto: string) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const qrScannerModule = useRef<Promise<typeof import("qr-scanner")> | null>(
    null,
  );
  const [estado, setEstado] = useState<Estado>("inactiva");

  useEffect(() => {
    qrScannerModule.current = import("qr-scanner");

    return () => {
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  async function activar() {
    if (!videoRef.current) return;

    setEstado("pidiendo-permiso");

    try {
      qrScannerModule.current ??= import("qr-scanner");
      const { default: QrScanner } = await qrScannerModule.current;

      scannerRef.current ??= new QrScanner(
        videoRef.current,
        (resultado) => {
          scannerRef.current?.stop();
          setEstado("inactiva");
          onDecode(resultado.data);
        },
        {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
        },
      );

      await scannerRef.current.start();
      setEstado("escaneando");
    } catch (error) {
      // El nombre del DOMException es lo único estable entre navegadores —
      // el texto del mensaje varía y `qr-scanner` no lo tipa.
      const nombre =
        error && typeof error === "object" && "name" in error
          ? String(error.name)
          : "";
      const sinPermiso =
        nombre === "NotAllowedError" ||
        nombre === "PermissionDeniedError" ||
        nombre === "SecurityError";
      setEstado(sinPermiso ? "sin-permiso" : "sin-camara");
    }
  }

  function detener() {
    scannerRef.current?.stop();
    setEstado("inactiva");
  }

  const escaneando = estado === "escaneando";
  const conError = estado === "sin-permiso" || estado === "sin-camara";

  return (
    <div className={className}>
      <div
        className={cn(
          "bg-muted relative mx-auto flex aspect-square w-full max-w-xs items-center justify-center overflow-hidden rounded-xl border-2 border-dashed",
          escaneando ? "border-brand-500" : "border-border",
        )}
      >
        {/* Nunca se oculta con `display:none` ni se desmonta: en varios
            navegadores de celular un <video> que estuvo con display:none
            mientras arrancaba el stream se queda en negro al mostrarlo de
            nuevo. Se lo deja siempre pintando, tapado por la tarjeta de
            abajo (que sí tiene fondo propio) mientras no hay nada que
            mostrar. */}
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 size-full object-cover"
        />

        {!escaneando ? (
          <span className="bg-muted text-muted-foreground absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-6 text-center">
            {conError ? (
              <ShieldAlert className="size-8" />
            ) : (
              <SquareDashed className="size-8" />
            )}
            <span className="text-sm font-medium">
              {estado === "sin-permiso" || estado === "sin-camara"
                ? "Cámara no disponible"
                : "Cámara apagada"}
            </span>
          </span>
        ) : null}
      </div>

      <p
        className="text-muted-foreground mt-4 text-center text-sm"
        aria-live="polite"
      >
        {escaneando ? "Buscando un código…" : COPY[estado]}
      </p>

      <Button
        className="mt-4 w-full"
        onClick={escaneando ? detener : activar}
        disabled={estado === "pidiendo-permiso"}
      >
        {escaneando ? (
          <>
            <CameraOff className="size-4" />
            Apagar cámara
          </>
        ) : (
          <>
            <Camera className="size-4" />
            Activar cámara
          </>
        )}
      </Button>
    </div>
  );
}
