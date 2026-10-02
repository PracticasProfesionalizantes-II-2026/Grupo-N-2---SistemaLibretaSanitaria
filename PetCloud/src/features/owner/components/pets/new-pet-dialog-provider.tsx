"use client";

import { createContext, useCallback, useContext, useState } from "react";

import { PetFormModal } from "@/features/owner/components/pets/pet-form-modal";

const NewPetDialogContext = createContext<(() => void) | null>(null);

/**
 * El alta de mascota, disponible desde cualquier pantalla del dueño.
 *
 * Existe porque "Agregar mascota" aparece en cinco lugares —el selector del
 * topbar, su desplegable, el inicio sin mascotas, el listado, y la pantalla de
 * autodeclaración de una campaña— y todos menos uno llevaban primero a
 * `/mis-mascotas`, donde había que volver a buscar el botón. Un paso de más
 * para la acción más común de la aplicación.
 *
 * Se monta una sola vez en el shell, así que el formulario no se duplica por
 * cada botón que pueda abrirlo. El `key` cambia en cada apertura para que sea
 * un formulario nuevo y no arrastre los datos de la mascota anterior.
 *
 * Deliberadamente cubre solo el ALTA. La edición sigue siendo local de cada
 * pantalla: depende de qué mascota se está editando, y eso no es estado global.
 */
export function NewPetDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [apertura, setApertura] = useState(0);

  const abrir = useCallback(() => {
    setApertura((n) => n + 1);
    setAbierto(true);
  }, []);

  return (
    <NewPetDialogContext.Provider value={abrir}>
      {children}

      <PetFormModal
        key={`alta-${apertura}`}
        open={abierto}
        onClose={() => setAbierto(false)}
      />
    </NewPetDialogContext.Provider>
  );
}

/** Abre el formulario de alta sobre la pantalla actual, sin navegar. */
export function useNewPetDialog() {
  const abrir = useContext(NewPetDialogContext);
  if (!abrir) {
    throw new Error(
      "useNewPetDialog debe usarse dentro de <NewPetDialogProvider>",
    );
  }
  return abrir;
}
