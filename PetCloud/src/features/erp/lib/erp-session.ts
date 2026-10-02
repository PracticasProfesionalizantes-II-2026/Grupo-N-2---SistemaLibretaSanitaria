import "server-only";

import {
  requireInstitutionOwner,
  requirePremiumVet,
} from "@/features/vet/lib/vet-premium";
import type { VetSession } from "@/features/vet/lib/vet-session";

/**
 * La puerta de entrada del ERP, del lado de la aplicación.
 *
 * Es una capa fina sobre `requirePremiumVet()` a propósito, y la indirección
 * se paga sola: hoy las dos condiciones del ERP —sesión de veterinario y
 * Premium activo— son exactamente las de Turnos, pero el ERP va a sumar las
 * suyas (habilitación fiscal, permiso de caja, cierre de ejercicio) y ese día
 * se agregan acá sin tocar una sola pantalla de PetCloud.
 *
 * El equivalente del lado de la base es `erp.has_access()` (migración 100), que
 * es la que de verdad protege los datos. Esta función existe para cortar
 * ANTES: sin ella, alguien sin Premium llenaría un formulario de venta entero
 * para que RLS le devuelva una fila vacía sin explicar por qué.
 *
 * Corta con un redirect y no con una excepción: llegar sin Premium es el caso
 * normal de cualquier veterinaria que todavía no se suscribió, no una anomalía
 * — mismo criterio que `requireVet()` y `requirePremiumVet()`.
 */
export async function requireErp(): Promise<VetSession> {
  return requirePremiumVet();
}

/**
 * Para lo que además exige ser el titular de la institución: cierre de caja,
 * datos fiscales, alta y baja de empleados.
 *
 * Tira una excepción en vez de redirigir, igual que `requireInstitutionOwner()`:
 * la interfaz ya oculta esos controles para quien no es titular, así que llegar
 * hasta acá no es un flujo esperado.
 */
export async function requireErpOwner(): Promise<VetSession> {
  await requirePremiumVet();

  return requireInstitutionOwner();
}
