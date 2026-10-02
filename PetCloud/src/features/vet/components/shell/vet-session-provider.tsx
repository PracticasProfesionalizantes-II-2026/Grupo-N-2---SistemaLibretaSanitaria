"use client";

import { createContext, useContext } from "react";

import type { VetSession } from "@/features/vet/lib/vet-session";

/**
 * El profesional y su institución, para los componentes de cliente.
 *
 * Se resuelve una vez en el layout —que es servidor y puede validar el token— y
 * baja por contexto. El sidebar, el topbar, la configuración y los formularios
 * clínicos lo necesitan; consultarlo en cada uno sería la misma consulta cinco
 * veces por pantalla.
 *
 * De acá sale `licenciaValidada`, que es lo que le permite a los formularios
 * explicar por qué el botón de firmar está deshabilitado **antes** de que la
 * persona escriba la consulta entera. La regla de verdad la hace cumplir la base.
 */
const VetSessionContext = createContext<VetSession | null>(null);

export function VetSessionProvider({
  session,
  children,
}: {
  session: VetSession | null;
  children: React.ReactNode;
}) {
  return (
    <VetSessionContext.Provider value={session}>
      {children}
    </VetSessionContext.Provider>
  );
}

export function useVetSession() {
  return useContext(VetSessionContext);
}
