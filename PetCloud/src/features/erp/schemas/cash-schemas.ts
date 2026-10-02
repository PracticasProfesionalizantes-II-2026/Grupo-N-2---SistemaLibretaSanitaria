import { z } from "zod";

const requerido = "Este campo es obligatorio";

/**
 * Schemas del módulo de Caja (migración 106).
 *
 * Mismo criterio que `purchase-schemas.ts`: cada rango repite el CHECK de su
 * columna a propósito, para que el error aparezca debajo del campo mientras
 * la persona escribe.
 */

const pesos = (mensaje: string) =>
  z
    .number({ message: mensaje })
    .positive("El monto tiene que ser mayor que cero")
    .max(99_999_999, "Ese monto es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 100)),
      "Como mucho dos decimales",
    );

const CASH_MOVEMENT_KINDS = [
  "aporte",
  "caja_chica",
  "retiro",
  "pago_proveedor",
] as const;

export const cashMovementSchema = z.object({
  tipo: z.enum(CASH_MOVEMENT_KINDS, { message: "Elegí el tipo de movimiento" }),
  monto: pesos("Ingresá el monto"),
  nota: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
});

export type CashMovementValues = z.infer<typeof cashMovementSchema>;

/**
 * El contado puede ser 0 (caja vacía) pero no negativo — a diferencia del
 * monto de un movimiento, acá 0 es un valor real y no un error de carga.
 */
export const arqueoSchema = z.object({
  contado: z
    .number({ message: "Ingresá el monto contado" })
    .min(0, "No puede ser negativo")
    .max(999_999_999, "Ese monto es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 100)),
      "Como mucho dos decimales",
    ),
  motivo: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
});

export type ArqueoValues = z.infer<typeof arqueoSchema>;

export const voidCashMovementSchema = z.object({
  movimientoId: z.string().min(1, requerido),
  motivo: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
});

export type VoidCashMovementValues = z.infer<typeof voidCashMovementSchema>;
