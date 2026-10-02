"use client";

import { useState } from "react";
import { toast } from "sonner";

import { signOut } from "@/features/auth/actions/session-actions";

/**
 * Cerrar sesión, en un solo lugar.
 *
 * Estaba escrito cinco veces —el menú de los cuatro paneles y las dos pantallas
 * de configuración— y las cinco hacían lo mismo: un toast y un `router.push`.
 * Ahora la acción borra la sesión del servidor y redirige sola; el toast se
 * dispara antes porque después de la redirección este componente ya no existe.
 */
export function useSignOut() {
  const [pending, setPending] = useState(false);

  return {
    pending,
    signOut: async () => {
      setPending(true);
      toast.success("Sesión cerrada");
      await signOut();
    },
  };
}
