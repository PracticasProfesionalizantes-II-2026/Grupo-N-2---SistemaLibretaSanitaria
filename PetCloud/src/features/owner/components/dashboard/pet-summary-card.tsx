import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { HealthStatusChip } from "@/components/ui/status-chip";
import { capitalize, formatAge } from "@/lib/format";
import type { Pet } from "@/types/pet";

/**
 * La mascota activa en el inicio.
 *
 * El nombre es un enlace al perfil —que es la vista de salud: últimas visitas,
 * últimas cargas y próximos turnos—. Antes el único camino era el "Ver perfil
 * completo" de abajo de todo, y el nombre, que es lo primero que alguien toca,
 * no hacía nada.
 *
 * La tarjeta entera NO es un enlace, y no es pereza: el avatar es `expandable`
 * (abre la foto en grande) y el chip de estado es su propio control. Envolver
 * todo en un `<a>` anidaría elementos interactivos, que además de ser HTML
 * inválido deja la navegación por teclado inservible.
 */
export function PetSummaryCard({ pet }: { pet: Pet }) {
  const facts = [
    { label: "Especie", value: capitalize(pet.especie) },
    { label: "Raza", value: pet.raza },
    { label: "Sexo", value: capitalize(pet.sexo) },
    { label: "Peso", value: `${pet.pesoKg} kg` },
    { label: "Tipo de sangre", value: pet.tipoSangre ?? "Sin registrar" },
  ];

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={pet.nombre} src={pet.fotoUrl} size="lg" expandable />
          <div>
            <h2 className="text-lg font-bold">
              <Link
                href={`/mascotas/${pet.id}`}
                className="text-foreground hover:text-brand-700 hover:underline"
              >
                {pet.nombre}
              </Link>
            </h2>
            {/* Sin fecha de nacimiento la edad viene vacía: no se renderiza el
                párrafo para no dejar un hueco bajo el nombre. */}
            {formatAge(pet.fechaNacimiento) ? (
              <p className="text-muted-foreground text-sm">
                {formatAge(pet.fechaNacimiento)}
              </p>
            ) : null}
          </div>
        </div>
        <HealthStatusChip status={pet.estadoSanitario} />
      </div>

      <dl className="border-border mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-5 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-muted-foreground text-xs">{fact.label}</dt>
            <dd className="text-foreground mt-0.5 text-sm font-medium">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <Link
        href={`/mascotas/${pet.id}`}
        className="text-brand-700 mt-5 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        Ver perfil completo
        <ArrowRight className="size-4" />
      </Link>
    </Card>
  );
}
