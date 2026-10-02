"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { VET_BASE } from "@/config/vet-nav";
import {
  UNVALIDATED_INSTITUTION_MESSAGE,
  useInstitutionValidated,
} from "@/features/vet/components/shared/unvalidated-institution-notice";
import {
  searchPatients,
  type PatientSearchResult,
} from "@/features/vet/actions/scan-actions";

/**
 * Buscador global del topbar. Resuelve el caso más frecuente del mostrador:
 * llega un paciente sin QR y hay que encontrarlo por nombre, por el dueño o por
 * el nº de registro.
 */
export function PatientSearchBox() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  // 080: sin validar, la búsqueda solo trae pacientes propios.
  const institucionValidada = useInstitutionValidated();

  // La búsqueda va contra la base, así que se espera a que la persona termine de
  // tipear: sin esto sale una consulta por tecla. `cancelado` descarta las
  // respuestas que llegan tarde, para que un resultado viejo no pise al nuevo.
  useEffect(() => {
    const texto = query.trim();
    // Con menos de dos letras no se consulta y tampoco hace falta limpiar: el
    // panel no se abre, y `results` se descarta abajo.
    if (texto.length < 2) return;

    let cancelado = false;

    const timer = setTimeout(async () => {
      const encontrados = await searchPatients(texto);
      if (!cancelado) setResults(encontrados.slice(0, 6));
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [query]);

  const showPanel = focused && query.trim().length >= 2;
  const visibles = showPanel ? results : [];

  return (
    <div className="relative hidden max-w-md flex-1 md:block">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        // El blur se retrasa para que el click sobre un resultado llegue a disparar.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Buscar paciente, dueño o nº de registro..."
        className="h-10 pl-9"
        aria-label="Buscar paciente"
      />

      {showPanel ? (
        <div className="border-border bg-card absolute z-50 mt-2 w-full rounded-xl border p-1.5 shadow-lg">
          {visibles.length === 0 && !institucionValidada ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">
              {UNVALIDATED_INSTITUTION_MESSAGE}
            </p>
          ) : visibles.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">
              Sin resultados para “{query}”.{" "}
              <Link
                href={`${VET_BASE}/escanear`}
                className="text-brand-700 font-medium hover:underline"
              >
                Buscar de otra forma
              </Link>
            </p>
          ) : (
            visibles.map(({ patient }) => (
              <Link
                key={patient.id}
                href={`${VET_BASE}/pacientes/${patient.id}`}
                onClick={() => {
                  setQuery("");
                  setFocused(false);
                }}
                className="hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2"
              >
                <Avatar name={patient.nombre} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">
                    {patient.nombre}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {patient.raza} · {patient.qrCode}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
