import type { UserRole } from "@/config/roles";

/**
 * Mapa de rutas del sistema.
 *
 * Es la única lista: de acá salen las tres decisiones que dependen de en qué
 * pantalla estamos —si lleva tema oscuro, si exige sesión y si el rol puede
 * entrar—. Estaban por separado y describían lo mismo con distintas palabras,
 * que es la forma segura de que un día no coincidan.
 *
 * Hace falta enumerarlas porque el dueño ocupa las URL en español de la raíz
 * (`/inicio`, `/mis-mascotas`), así que no hay un prefijo que separe lo público
 * de lo privado.
 */

/** Sitio institucional: sin sesión, sin tema. */
export const PUBLIC_ROUTES = [
  "/",
  "/como-funciona",
  "/para-veterinarias",
  "/nosotros",
  "/contacto",
  "/legales",
  // El collar: lo abre quien encuentra a la mascota, que no tiene cuenta.
  "/p",
];

/** Pantallas de acceso: solo tienen sentido **sin** sesión iniciada. */
const AUTH_ROUTES = ["/login", "/registro"];

/**
 * Pantallas que necesitan sesión pero no pertenecen a ningún panel.
 *
 * Están en el grupo de rutas `(auth)` porque comparten el layout centrado, pero
 * eso es una decisión de maquetado, no de acceso: a las dos se llega **después**
 * de autenticarse. Tratarlas como pantallas de acceso las volvía inalcanzables,
 * porque el paso 2 del proxy expulsa de ahí a quien ya tiene sesión:
 *
 * - `/cuenta-en-revision` se la muestra al veterinario recién confirmado cuya
 *   matrícula todavía se está validando. Sin sesión no hay matrícula que mirar.
 * - `/invitaciones` es la aceptación de una invitación al equipo veterinario
 *   (058). Quien la recibe puede ser cualquier rol con cuenta en PetCloud —
 *   `accept_team_invite()` decide adentro quién puede aceptar—, así que no
 *   puede vivir en un solo panel de rol. Y `requireVet()` no sirve para
 *   protegerla porque quien acepta todavía no tiene fila de profesional.
 * - `/cuenta-incompleta` es la salida de una cuenta a medio crear: rol en el
 *   JWT pero sin ficha de profesional (veterinario).
 *   Antes esos guards mandaban a `/login`, el paso 2 del proxy devolvía al
 *   panel y el panel otra vez a `/login`: un bucle infinito de redirecciones.
 *   Tiene que estar fuera de todo panel y abierta a los cuatro roles.
 */
export const INCOMPLETE_ACCOUNT_ROUTE = "/cuenta-incompleta";

const SESSION_ROUTES = [
  "/cuenta-en-revision",
  INCOMPLETE_ACCOUNT_ROUTE,
  "/invitaciones",
];

/**
 * El onboarding es de todos los roles: la cuenta ya existe y la sesión está
 * abierta, lo que falta son los datos.
 */
const ONBOARDING_ROUTES = ["/onboarding"];

const OWNER_ROUTES = [
  "/inicio",
  "/mis-mascotas",
  "/mascotas",
  "/visitas",
  "/recordatorios",
  "/documentos",
  "/leer-qr",
  "/perfil",
  "/configuracion",
  // Directorio de veterinarias cercanas (055). Sin esto `matches()` no
  // reconoce el prefijo y la ruta cae fuera de `isAllowedForRole`.
  "/veterinarias",
];

/**
 * El prefijo del panel veterinario.
 *
 * Todas las rutas del panel cuelgan de `/veterinaria` porque el panel del dueño
 * ya ocupa las rutas raíz en español (`/visitas`, `/configuracion`, `/perfil`) y
 * los nombres se pisarían. El prefijo también deja claro en la URL en qué panel
 * está parado el usuario.
 *
 * Vive acá, y no en `vet-nav.ts`, para que los dos archivos de menú
 * (`vet-nav.ts` y `erp-nav.ts`) puedan leerlo sin que uno importe al otro: el
 * menú del veterinario necesita los módulos del ERP como submenú y el del ERP
 * necesita el prefijo, y ese ida y vuelta es un ciclo. Como `ERP_BASE` se
 * calcula en el módulo, el ciclo no sería una advertencia del linter sino un
 * `ReferenceError` en tiempo de ejecución.
 */
export const VET_BASE = "/veterinaria";

const VET_ROUTES = [VET_BASE];
const ADMIN_ROUTES = ["/admin"];

/**
 * A qué puede entrar cada rol. Nadie ve el panel de otro.
 *
 * El onboarding y las pantallas de sesión van en los cuatro: no son de un panel,
 * son estados por los que cualquiera puede pasar.
 */
const COMUNES = [...ONBOARDING_ROUTES, ...SESSION_ROUTES];

const ROUTES_BY_ROLE: Record<UserRole, string[]> = {
  dueno: [...OWNER_ROUTES, ...COMUNES],
  veterinario: [...VET_ROUTES, ...COMUNES],
  admin: [...ADMIN_ROUTES, ...COMUNES],
};

/**
 * Todo lo que está adentro del sistema, sin distinguir rol.
 *
 * Se exporta para que `robots.ts` derive de acá qué bloquear en vez de repetir
 * la lista: una segunda enumeración de lo mismo es exactamente lo que este
 * archivo existe para evitar.
 */
export const APP_ROUTES = [
  ...OWNER_ROUTES,
  ...VET_ROUTES,
  ...ADMIN_ROUTES,
  ...COMUNES,
];

function matches(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export const isPublicRoute = (pathname: string) =>
  matches(pathname, PUBLIC_ROUTES);

export const isAuthRoute = (pathname: string) => matches(pathname, AUTH_ROUTES);

export const isAllowedForRole = (pathname: string, role: UserRole) =>
  matches(pathname, ROUTES_BY_ROLE[role] ?? []);

/**
 * ¿Es una pantalla de adentro del sistema, de cualquier rol?
 *
 * Sirve para dos cosas que son la misma pregunta con distinta consecuencia:
 *
 * - **El tema.** El modo oscuro es una preferencia de quien trabaja adentro; el
 *   sitio institucional y las pantallas de acceso se ven siempre en claro.
 * - **Distinguir "no te corresponde" de "no existe".** Una URL que no pertenece
 *   a ningún panel no es un problema de permisos: está mal escrita. Mandarla al
 *   panel de la persona esconde el error; dejarla pasar hace que Next muestre su
 *   404, que es lo que realmente pasó.
 */
export const isAppRoute = (pathname: string) => matches(pathname, APP_ROUTES);

/** El tema sigue exactamente el mismo límite: adentro del sistema, o claro. */
export const isThemedRoute = isAppRoute;
