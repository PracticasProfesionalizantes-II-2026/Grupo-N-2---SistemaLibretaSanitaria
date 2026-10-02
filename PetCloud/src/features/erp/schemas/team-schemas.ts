import { z } from "zod";

import { DELEGABLE_MODULES } from "@/types/erp";

/**
 * Schemas del módulo de Equipo (delegación de permisos, migración 111).
 *
 * Un único schema sirve para otorgar y revocar: la acción del lado del
 * servidor decide cuál RPC/`UPDATE` correr según el estado vigente de la
 * fila, no según un campo distinto en el payload — el checkbox de la
 * pantalla envía siempre la misma forma, prendido o apagado.
 */

const requerido = "Este campo es obligatorio";

export const teamModuleGrantSchema = z.object({
  profesionalId: z.string().min(1, requerido),
  modulo: z.enum(DELEGABLE_MODULES, {
    message: "Elegí un módulo válido",
  }),
});

export type TeamModuleGrantValues = z.infer<typeof teamModuleGrantSchema>;
