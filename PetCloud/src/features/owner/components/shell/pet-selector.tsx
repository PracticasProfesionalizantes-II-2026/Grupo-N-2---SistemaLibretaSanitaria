"use client";

import { Check, ChevronDown, Plus } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { useNewPetDialog } from "@/features/owner/components/pets/new-pet-dialog-provider";
import { detalleMascota } from "@/features/owner/lib/pet-label";
import { cn } from "@/lib/utils";

export function PetSelector() {
  const { pets, activePet, setActivePetId } = useActivePet();
  const abrirAlta = useNewPetDialog();

  // Sin mascotas no hay nada que seleccionar: el control se convierte en el
  // camino para cargar la primera, que es lo único que tiene sentido hacer.
  //
  // Abre el formulario acá mismo. Antes enlazaba a `/mis-mascotas`, y desde
  // ahí había que volver a buscar el botón de cargar: un paso de más para lo
  // único que se puede hacer en ese estado.
  //
  // En `/inicio` y `/mis-mascotas` este botón se superpone con el del estado
  // vacío, pero no se saca: el resto de las pantallas del dueño (`/visitas`,
  // `/campanas`, `/alertas`, `/leer-qr`, `/recordatorios`, `/documentos`) no
  // tienen ninguna acción de alta cuando no hay mascotas, y este es el único
  // camino directo desde ahí.
  if (!activePet) {
    return (
      <button
        type="button"
        onClick={abrirAlta}
        className="border-border hover:bg-muted text-brand-700 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm font-medium"
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">Cargar mascota</span>
      </button>
    );
  }

  return (
    <Dropdown
      align="start"
      // En mobile el nombre está oculto (`hidden sm:block`) y el botón quedaba
      // sin nombre accesible: solo un avatar y una flecha.
      triggerLabel={`Mascota activa: ${activePet.nombre}. Cambiar de mascota`}
      trigger={(open) => (
        <span className="border-border hover:bg-muted flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5">
          <Avatar name={activePet.nombre} src={activePet.fotoUrl} size="sm" />
          <span className="hidden text-left sm:block">
            <span className="text-foreground block text-sm leading-tight font-medium">
              {activePet.nombre}
            </span>
            <span className="text-muted-foreground block text-xs leading-tight">
              {detalleMascota(activePet)}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      )}
    >
      {(close) => (
        <>
          <p className="text-muted-foreground px-3 py-1.5 text-xs font-semibold uppercase">
            Mascota activa
          </p>

          {pets.map((pet) => (
            <DropdownItem
              key={pet.id}
              onClick={() => {
                setActivePetId(pet.id);
                close();
              }}
            >
              <Avatar name={pet.nombre} src={pet.fotoUrl} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{pet.nombre}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {detalleMascota(pet)}
                </span>
              </span>
              {pet.id === activePet.id ? (
                <Check className="text-brand-600 size-4 shrink-0" />
              ) : null}
            </DropdownItem>
          ))}

          <div className="border-border mt-1.5 border-t pt-1.5">
            <button
              type="button"
              onClick={() => {
                close();
                abrirAlta();
              }}
              className="text-brand-700 hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium"
            >
              <Plus className="size-4" />
              Cargar mascota
            </button>
          </div>
        </>
      )}
    </Dropdown>
  );
}
