import { z } from "zod";

/**
 * Schemas del módulo de códigos de barra (migración 113).
 *
 * `code` repite el CHECK `length(trim(code)) > 0` de la tabla: el error tiene
 * que aparecer debajo del campo mientras la persona escribe, no como un
 * mensaje de PostgreSQL después de mandar el formulario — mismo criterio que
 * `stock-schemas.ts`.
 */

export const addBarcodeSchema = z.object({
  productoId: z.string().min(1, "Elegí el producto"),
  codigo: z
    .string()
    .trim()
    .min(1, "Ingresá un código")
    .max(64, "Máximo 64 caracteres"),
});

export type AddBarcodeValues = z.infer<typeof addBarcodeSchema>;

export const removeBarcodeSchema = z.object({
  id: z.string().min(1, "Este campo es obligatorio"),
});

export type RemoveBarcodeValues = z.infer<typeof removeBarcodeSchema>;
