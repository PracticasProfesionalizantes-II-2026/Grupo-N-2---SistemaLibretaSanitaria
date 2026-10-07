import { Constants } from "@/types/database";
import type { Database } from "@/types/database";

/**
 * Nada en el repo expresaba en TypeScript el orden `view < edit < owner`
 * hasta esto. La base ya lo usa (`permission >= p_min_permission`, migración
 * 035) apoyándose en el orden de declaración del enum. `Constants` sale
 * regenerado de ese mismo enum (`npm run db:types`), así que reordenarlo en
 * la base reescribe este array solo — un mapa a mano (`{ view: 0, ... }`)
 * sería una segunda fuente de verdad que ningún test detecta desincronizada.
 */
export type Permiso = Database["public"]["Enums"]["share_permission"];

export const rangoPermiso = (p: Permiso): number =>
  Constants.public.Enums.share_permission.indexOf(p);

/**
 * Qué puede hacer cada nivel (ver la especificación del proyecto). La que hace cumplir
 * esto es la RLS; estos helpers solo deciden qué botones mostrar. Sin permiso
 * (`undefined`: mascota ajena o sin sesión) no se ofrece nada.
 */

/** Editar la mascota, cargar salud, modo perdida, QR y collar. */
export const canEditPet = (p: Permiso | undefined): boolean =>
  p !== undefined && rangoPermiso(p) >= rangoPermiso("edit");

/** Compartir, invitar, revocar y cambiar permisos. */
export const canManageAccess = (p: Permiso | undefined): boolean =>
  p !== undefined && rangoPermiso(p) >= rangoPermiso("owner");
