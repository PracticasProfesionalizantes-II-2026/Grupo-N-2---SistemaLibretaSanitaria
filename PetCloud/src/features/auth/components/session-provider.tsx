"use client";

import { createContext, useContext } from "react";

import type { UserRole } from "@/config/roles";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  nombre: string;
  apellido: string;
  telefono: string;
  direccion: string;
  avatarUrl: string | null;
  /**
   * Jurisdicción declarada: decide qué campañas y qué ordenanza ve. `null`
   * cuando todavía no declaró ninguna — desde la 021, `getCurrentUser()` ya no
   * la completa con un municipio por defecto.
   */
  municipioId: string | null;
};

const SessionContext = createContext<SessionUser | null>(null);

/**
 * Quién tiene la sesión abierta, para los componentes de cliente.
 *
 * El dato se resuelve una vez en el layout —que es servidor y puede validar el
 * token— y baja por contexto. Los componentes de cliente no lo consultan por su
 * cuenta: harían un viaje al servidor de auth cada uno, y ninguno podría
 * verificar la firma del JWT de todos modos.
 */
export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
  );
}

/** El nombre para saludar y el email para mostrar. Nunca para decidir permisos. */
export function useSessionUser() {
  return useContext(SessionContext);
}
