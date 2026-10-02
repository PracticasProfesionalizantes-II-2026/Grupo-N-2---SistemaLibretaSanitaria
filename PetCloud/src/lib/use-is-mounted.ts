"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` durante el render del servidor y la hidratación, `true` después.
 *
 * Sirve para lo que solo se sabe en el cliente (el tema resuelto, por ejemplo)
 * sin provocar un desajuste de hidratación. Se usa `useSyncExternalStore` en vez
 * del clásico `useEffect(() => setMounted(true))` porque no dispara un render en
 * cascada.
 */
export function useIsMounted() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
