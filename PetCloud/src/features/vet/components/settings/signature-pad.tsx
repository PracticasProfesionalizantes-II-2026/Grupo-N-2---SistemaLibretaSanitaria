"use client";

import { Eraser, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  repintar,
  tintaSuficiente,
  type Punto,
  type Trazo,
} from "@/features/vet/lib/firma-trazos";

/**
 * El lienzo donde se dibuja la firma.
 *
 * Escrito a mano, sin dependencia. Se evaluó `react-signature-canvas`: su
 * última publicación es `1.1.0-alpha.2`, de hace cerca de un año, en el canal
 * alpha, sin rango declarado para React 19, y arrastra `signature_pad`. Ochenta
 * líneas contra una alpha sin mantenimiento, para el único artefacto que hace
 * válido un documento clínico, es el intercambio equivocado.
 *
 * Tres cosas que parecen detalle y no lo son:
 *
 *   · **Pointer Events, no mouse ni touch por separado.** Un solo juego de
 *     manejadores cubre mouse, lápiz y dedo. `setPointerCapture` es lo que hace
 *     que un dedo que se sale del borde termine el trazo limpio en vez de dejar
 *     una línea colgada.
 *   · **`touch-action: none`.** Sin eso el navegador se queda con el gesto y
 *     hace scroll o zoom de la página en vez de dibujar. Es la forma más común
 *     en que una firma con el dedo falla, y en escritorio no se ve nunca.
 *   · **El backing store va escalado por `devicePixelRatio`.** Sin eso el PNG
 *     que termina en un documento legal es un borrón en cualquier teléfono.
 *
 * El lienzo mantiene la relación 8:3 porque `src/lib/pdf/firma.ts` estampa a
 * 40 × 15 mm con ancho y alto explícitos: jsPDF estira lo que le llegue, así
 * que cualquier otra relación sale deformada. Es una restricción del renderer,
 * no una decisión de gusto.
 */

type Props = {
  /**
   * El PNG del dibujo actual, o `null` si todavía no alcanza para ser una
   * firma. Se recalcula al terminar cada trazo, al deshacer y al borrar.
   */
  onDibujoChange: (imagen: Blob | null) => void;
  deshabilitado?: boolean;
};

export function SignaturePad({ onDibujoChange, deshabilitado }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trazosRef = useRef<Trazo[]>([]);
  const trazoActualRef = useRef<Trazo | null>(null);
  const [hayTrazos, setHayTrazos] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  /** El contexto 2D ya escalado, listo para dibujar en coordenadas CSS. */
  const contexto = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    return { canvas, ctx };
  }, []);

  /**
   * Ajusta el backing store al tamaño real en pantalla y repinta.
   *
   * Corre al montar y en cada cambio de tamaño (girar el teléfono, por
   * ejemplo). Los puntos se guardan en píxeles CSS absolutos, así que un
   * cambio de tamaño conserva el dibujo pero no lo reescala: es el precio de no
   * inventar un sistema de coordenadas propio, y el caso —redimensionar a mitad
   * de una firma— se resuelve con "Borrar todo".
   */
  const ajustarTamano = useCallback(() => {
    const actual = contexto();
    if (!actual) return;

    const { canvas, ctx } = actual;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    repintar(ctx, trazosRef.current, rect.width, rect.height);
  }, [contexto]);

  useEffect(() => {
    ajustarTamano();

    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => ajustarTamano());
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [ajustarTamano]);

  /**
   * Exporta el dibujo actual.
   *
   * `toBlob` puede devolver `null`, y eso no es "no hay firma": es un fallo del
   * navegador al codificar. Se distingue y se muestra, porque un `null` tratado
   * como ausencia deja a la persona apretando "Guardar" sin entender por qué no
   * pasa nada.
   */
  const publicar = useCallback(() => {
    const canvas = canvasRef.current;
    const trazos = trazosRef.current;

    setHayTrazos(trazos.length > 0);

    if (!canvas || !tintaSuficiente(trazos)) {
      setErrorExport(null);
      onDibujoChange(null);
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setErrorExport(
          "Este navegador no pudo generar la imagen de la firma. Probá con otro.",
        );
        onDibujoChange(null);
        return;
      }

      setErrorExport(null);
      onDibujoChange(blob);
      // PNG y nada más: `firma.ts` estampa con `addImage(..., "PNG", ...)` y la
      // transparencia es lo que evita el recuadro blanco sobre el documento.
      // Nunca se pinta un fondo antes de exportar.
    }, "image/png");
  }, [onDibujoChange]);

  const puntoDesdeEvento = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const punto: Punto = {
      x: evento.clientX - rect.left,
      y: evento.clientY - rect.top,
    };

    return punto;
  };

  const alBajar = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (deshabilitado) return;

    const punto = puntoDesdeEvento(evento);
    if (!punto) return;

    // La captura es lo que hace que un dedo que se sale del lienzo termine el
    // trazo en vez de dejar la línea colgada esperando un `pointerup` que va a
    // llegarle a otro elemento.
    evento.currentTarget.setPointerCapture(evento.pointerId);
    trazoActualRef.current = [punto];
  };

  const alMover = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    const trazo = trazoActualRef.current;
    if (!trazo) return;

    const punto = puntoDesdeEvento(evento);
    const actual = contexto();
    if (!punto || !actual) return;

    const anterior = trazo[trazo.length - 1];
    trazo.push(punto);

    // Se dibuja solo el segmento nuevo: repintar la lista entera en cada
    // `pointermove` se nota en el trazo con el dedo.
    const { ctx } = actual;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(anterior.x, anterior.y);
    ctx.lineTo(punto.x, punto.y);
    ctx.stroke();
  };

  const alSoltar = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    const trazo = trazoActualRef.current;
    if (!trazo) return;

    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId);
    }

    trazoActualRef.current = null;
    trazosRef.current = [...trazosRef.current, trazo];
    publicar();
  };

  const repintarTodo = () => {
    const actual = contexto();
    if (!actual) return;

    const rect = actual.canvas.getBoundingClientRect();
    repintar(actual.ctx, trazosRef.current, rect.width, rect.height);
  };

  const deshacer = () => {
    trazosRef.current = trazosRef.current.slice(0, -1);
    repintarTodo();
    publicar();
  };

  const borrarTodo = () => {
    trazosRef.current = [];
    repintarTodo();
    publicar();
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        aria-label="Lienzo para dibujar tu firma"
        role="img"
        // `touch-none` es la clase sin la cual esto no anda con el dedo, y
        // `overscroll-contain` evita que el gesto arrastre la página detrás.
        className="border-border bg-background aspect-[8/3] w-full max-w-[640px] cursor-crosshair touch-none overscroll-contain rounded-lg border border-dashed select-none"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={deshacer}
          disabled={deshabilitado || !hayTrazos}
        >
          <Undo2 className="size-4" />
          Deshacer
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={borrarTodo}
          disabled={deshabilitado || !hayTrazos}
        >
          <Eraser className="size-4" />
          Borrar todo
        </Button>
      </div>

      {errorExport ? (
        <p className="text-danger text-sm">{errorExport}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Firmá con el dedo, el mouse o un lápiz. Revisala antes de guardar: una
          vez registrada no se edita, se reemplaza.
        </p>
      )}
    </div>
  );
}
