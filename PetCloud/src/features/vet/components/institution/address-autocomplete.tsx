"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  type AddressSuggestion,
  MIN_QUERY_LENGTH,
  buildPhotonUrl,
  parsePhotonResponse,
} from "@/lib/geocoding";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 350;

/**
 * Campo de dirección con sugerencias (combobox ARIA).
 *
 * Es un campo de texto común que además sugiere: si Photon no responde, la
 * persona sigue pudiendo escribir y guardar la dirección, solo que sin
 * coordenadas. Por eso un error de red no bloquea nada, apenas deja un aviso.
 *
 * Las coordenadas nunca se muestran: el componente avisa `onSelect` y el
 * formulario decide qué hacer con ellas.
 */
export function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  invalid,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (texto: string) => void;
  onSelect: (sugerencia: AddressSuggestion) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const listboxId = useId();
  const [sugerencias, setSugerencias] = useState<AddressSuggestion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [fallo, setFallo] = useState(false);
  // Solo se busca cuando la persona escribe: el valor inicial o el que
  // queda después de elegir una sugerencia no tienen que abrir la lista.
  const [consulta, setConsulta] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  // La búsqueda pendiente, para poder cortarla desde afuera del efecto:
  // Escape, perder el foco o elegir tienen que matar también la respuesta
  // que todavía no llegó, o esa respuesta volvería a abrir la lista.
  const pendiente = useRef<{ timer: number; controller: AbortController }>(
    null,
  );

  function cancelarBusqueda() {
    if (!pendiente.current) return;
    clearTimeout(pendiente.current.timer);
    pendiente.current.controller.abort();
    pendiente.current = null;
  }

  useEffect(() => {
    if (consulta === null || consulta.trim().length < MIN_QUERY_LENGTH) {
      return;
    }

    // Cada tecla cancela la búsqueda anterior: sin esto una respuesta vieja
    // que llega tarde pisaría a la nueva.
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(buildPhotonUrl(consulta), {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const resultado = parsePhotonResponse(await res.json());
        setSugerencias(resultado);
        setActivo(-1);
        setAbierto(true);
        setFallo(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Búsqueda de direcciones:", error);
        setSugerencias([]);
        setFallo(true);
      }
    }, DEBOUNCE_MS);
    pendiente.current = { timer, controller };

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [consulta]);

  function cerrar() {
    cancelarBusqueda();
    setAbierto(false);
  }

  function elegir(sugerencia: AddressSuggestion) {
    cancelarBusqueda();
    onSelect(sugerencia);
    setConsulta(null);
    setSugerencias([]);
    setAbierto(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      cerrar();
      return;
    }
    if (!abierto || sugerencias.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActivo((i) => (i + 1) % sugerencias.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActivo((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (event.key === "Enter" && activo >= 0) {
      // Sin esto Enter enviaría el formulario en vez de elegir.
      event.preventDefault();
      elegir(sugerencias[activo]);
    }
  }

  const mostrarLista = abierto && sugerencias.length > 0;

  return (
    <div
      ref={contenedor}
      className="relative"
      onBlur={(event) => {
        if (!contenedor.current?.contains(event.relatedTarget as Node)) {
          cerrar();
        }
      }}
    >
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={mostrarLista}
        aria-controls={listboxId}
        aria-activedescendant={
          mostrarLista && activo >= 0 ? `${listboxId}-${activo}` : undefined
        }
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder="Buscá la calle y la altura"
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const texto = event.target.value;
          onChange(texto);
          setConsulta(texto);
          if (texto.trim().length < MIN_QUERY_LENGTH) setSugerencias([]);
        }}
        onFocus={() => sugerencias.length > 0 && setAbierto(true)}
        onKeyDown={onKeyDown}
      />

      {mostrarLista ? (
        <div className="border-border bg-card absolute z-20 mt-1 w-full overflow-hidden rounded-lg border shadow-lg">
          <ul id={listboxId} role="listbox" aria-label="Direcciones sugeridas">
            {sugerencias.map((sugerencia, i) => (
              <li
                key={sugerencia.label}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activo}
                // `mousedown` y no `click`: el `blur` del input cerraría la
                // lista antes de que llegue el click.
                onMouseDown={(event) => {
                  event.preventDefault();
                  elegir(sugerencia);
                }}
                onMouseEnter={() => setActivo(i)}
                className={cn(
                  "text-foreground cursor-pointer px-3.5 py-2 text-sm",
                  i === activo && "bg-muted",
                )}
              >
                {sugerencia.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fallo ? (
        <p className="text-muted-foreground mt-1.5 text-xs">
          No pudimos buscar sugerencias. Podés guardar la dirección igual, pero
          sin ubicación en el mapa.
        </p>
      ) : null}
    </div>
  );
}
