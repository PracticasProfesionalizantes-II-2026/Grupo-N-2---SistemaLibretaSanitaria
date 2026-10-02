"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { searchOwnerPets } from "@/features/owner/actions/search-actions";
import type { PetSearchResult } from "@/features/owner/data/owner-queries";

/**
 * Buscador de mascotas del topbar del dueño. Busca entre todas sus mascotas,
 * no solo la activa.
 */
export function OwnerSearchBox() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Results are tagged with the query that produced them so stale matches
  // are never shown (or clickable) while a newer query is pending.
  const [resultado, setResultado] = useState<{
    q: string;
    items: PetSearchResult[];
  }>({ q: "", items: [] });

  const texto = query.trim();

  // Se espera a que termine de tipear; `cancelado` descarta respuestas tardías.
  useEffect(() => {
    if (!texto) return;

    let cancelado = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const encontrados = await searchOwnerPets(texto);
        if (!cancelado) setResultado({ q: texto, items: encontrados });
      } catch {
        if (!cancelado) setResultado({ q: texto, items: [] });
      } finally {
        if (!cancelado) setLoading(false);
      }
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(timer);
      setLoading(false);
    };
  }, [texto]);

  const showPanel = open && texto.length > 0;
  const vigente = resultado.q === texto;
  const results = vigente ? resultado.items : [];

  return (
    <div className="relative hidden max-w-md flex-1 md:block">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // El blur se retrasa para que el click sobre un resultado llegue a disparar.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Buscar mascotas..."
        className="h-10 pl-9"
        aria-label="Buscar mascotas"
      />

      {showPanel ? (
        <div className="border-border bg-card absolute z-50 mt-2 w-full rounded-xl border p-1.5 shadow-lg">
          {loading || !vigente ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">
              Buscando...
            </p>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">
              Sin resultados para “{texto}”.
            </p>
          ) : (
            results.map((pet) => (
              <Link
                key={pet.id}
                href={`/mascotas/${pet.id}`}
                onClick={() => {
                  setQuery("");
                  setOpen(false);
                }}
                className="hover:bg-muted flex items-center gap-2.5 rounded-lg px-3 py-2"
              >
                <Avatar name={pet.nombre} src={pet.fotoUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">
                    {pet.nombre}
                  </span>
                  {pet.raza ? (
                    <span className="text-muted-foreground block truncate text-xs">
                      {pet.raza}
                    </span>
                  ) : null}
                </span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
