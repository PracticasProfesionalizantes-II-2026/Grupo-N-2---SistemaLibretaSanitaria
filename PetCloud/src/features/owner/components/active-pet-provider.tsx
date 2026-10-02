"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { Pet } from "@/types/pet";

type ActivePetContextValue = {
  pets: Pet[];
  /** `null` mientras la persona todavía no cargó ninguna mascota. */
  activePet: Pet | null;
  setActivePetId: (id: string) => void;
};

const ActivePetContext = createContext<ActivePetContextValue | null>(null);

const STORAGE_KEY = "petcloud:mascota-activa";

/**
 * Las pantallas de Salud viven en `/mascotas/<id>/...`: ahí la mascota no es una
 * preferencia del topbar, es la ruta. Esta es la única traducción URL → mascota.
 */
function petIdFromPathname(pathname: string): string | null {
  return /^\/mascotas\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

/**
 * `sessionStorage` como store externo, no como estado de React copiado a mano.
 *
 * Es lo que permite que la preferencia sobreviva a un F5 sin el parpadeo ni el
 * desajuste de hidratación que trae leerla en un efecto: `useSyncExternalStore`
 * devuelve `null` en el servidor y el valor real recién en el cliente.
 *
 * `sessionStorage` y no `localStorage` por el mismo motivo que en
 * `useFormDraft`: se limpia sola al cerrar la pestaña, así que no hay que
 * acordarse de borrarla al cerrar sesión.
 */
let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function readStoredPetId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Puede no estar disponible (modo privado, permisos del navegador).
    // Perder la preferencia no rompe nada: se cae a la primera de la lista.
    return null;
  }
}

function storePetId(id: string) {
  if (readStoredPetId() === id) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ver `readStoredPetId`.
  }
  for (const listener of listeners) listener();
}

/** El servidor no tiene `sessionStorage`; ahí la preferencia sencillamente no existe. */
const serverSnapshot = () => null;

/**
 * Mascota activa del topbar.
 *
 * Las mascotas llegan por prop desde el layout, que las consulta en el servidor.
 *
 * `activePet` puede ser `null`, y no es un caso raro: es el estado de cualquiera
 * que acaba de crearse la cuenta.
 *
 * **Por qué no hay un `useState` con el id.** Había dos fuentes de verdad para
 * "qué mascota estoy mirando" —un estado local y el segmento `[petId]` de la
 * URL— y nada las conectaba. Se podía estar en `/mascotas/A` con el selector
 * diciendo "B", entrar a una mascota desde el listado y que el topbar siguiera
 * mostrando otra, o recargar y volver a la primera de la lista. La regla ahora
 * es una sola:
 *
 * 1. Si la ruta nombra una mascota, esa es la activa. Punto. Es la que el
 *    servidor usó para renderizar la pantalla, así que el topbar no puede
 *    decir otra cosa.
 * 2. Si no (Inicio, Visitas, Recordatorios…), vale la última elegida.
 *
 * Y como en Salud manda la ruta, elegir otra mascota desde el selector tiene
 * que **navegar**: tocar solo un estado dejaba el contenido en la anterior.
 */
export function ActivePetProvider({
  pets,
  children,
}: {
  pets: Pet[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const petIdEnRuta = petIdFromPathname(pathname);
  const petIdGuardado = useSyncExternalStore(
    subscribe,
    readStoredPetId,
    serverSnapshot,
  );

  // Entrar a una mascota también es elegirla: desde el listado, desde un enlace
  // directo o recargando. Sin esto, volver a Inicio mostraba la anterior.
  useEffect(() => {
    if (petIdEnRuta) storePetId(petIdEnRuta);
  }, [petIdEnRuta]);

  const setActivePetId = useCallback(
    (id: string) => {
      storePetId(id);

      const enRuta = petIdFromPathname(pathname);
      if (enRuta && enRuta !== id) {
        // Se conserva la solapa: si estabas en /vacunas de A, quedás en las de B.
        router.push(pathname.replace(`/mascotas/${enRuta}`, `/mascotas/${id}`));
      }
    },
    [pathname, router],
  );

  const value = useMemo(() => {
    const activePetId = petIdEnRuta ?? petIdGuardado;
    const activePet =
      pets.find((pet) => pet.id === activePetId) ?? pets[0] ?? null;
    return { pets, activePet, setActivePetId };
  }, [pets, petIdEnRuta, petIdGuardado, setActivePetId]);

  return (
    <ActivePetContext.Provider value={value}>
      {children}
    </ActivePetContext.Provider>
  );
}

export function useActivePet() {
  const context = useContext(ActivePetContext);
  if (!context) {
    throw new Error("useActivePet debe usarse dentro de <ActivePetProvider>");
  }
  return context;
}
