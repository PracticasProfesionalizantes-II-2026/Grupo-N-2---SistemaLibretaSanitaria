import { z } from "zod";

/**
 * Schemas del módulo de Clientes + cuenta corriente (migración 107).
 *
 * Mismo criterio que `cash-schemas.ts`: cada campo repite el CHECK de su
 * columna a propósito, para que el error aparezca debajo del campo mientras
 * la persona escribe.
 */

const requerido = "Este campo es obligatorio";

const TIPOS_DOCUMENTO = [
  "dni",
  "cuit",
  "cuil",
  "pasaporte",
  "sin_documento",
] as const;
const CONDICIONES_IVA = [
  "consumidor_final",
  "responsable_inscripto",
  "monotributista",
  "exento",
  "no_alcanzado",
] as const;

export const customerSchema = z.object({
  razonSocial: z
    .string()
    .trim()
    .min(1, requerido)
    .max(200, "Máximo 200 caracteres"),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO, {
    message: "Elegí el tipo de documento",
  }),
  numeroDocumento: z.string().trim().max(30, "Máximo 30 caracteres").optional(),
  condicionIva: z.enum(CONDICIONES_IVA, {
    message: "Elegí la condición frente al IVA",
  }),
  domicilio: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
  email: z
    .string()
    .trim()
    .email("Ese email no es válido")
    .max(200, "Máximo 200 caracteres")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(40, "Máximo 40 caracteres").optional(),
  /**
   * En pesos, igual que el resto de los formularios del ERP — la conversión
   * a centavos ocurre en la Server Action, nunca en el schema. `null` es
   * "sin límite" (decisión 5, `erp-customer-accounts` spec); `undefined`
   * cuando el campo queda vacío se normaliza a `null` antes de enviar.
   */
  limiteCredito: z
    .number({ message: "Ingresá un número" })
    .positive("Tiene que ser mayor que cero")
    .max(999_999_999, "Ese monto es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 100)),
      "Como mucho dos decimales",
    )
    .nullable()
    .optional(),
  profileId: z.string().trim().optional(),
});

export type CustomerValues = z.infer<typeof customerSchema>;

export const updateCustomerSchema = customerSchema.extend({
  id: z.string().min(1, requerido),
  active: z.boolean().optional(),
});

export type UpdateCustomerValues = z.infer<typeof updateCustomerSchema>;

/**
 * Ajuste manual de cuenta corriente — saldo inicial o corrección. El signo
 * lo elige la persona explícitamente (`sentido`) en vez de pedir un número
 * negativo, mismo criterio que el formulario de ajuste de stock.
 */
export const accountAdjustmentSchema = z.object({
  customerId: z.string().min(1, requerido),
  sentido: z.enum(["debe", "haber"], {
    message: "Elegí el sentido del ajuste",
  }),
  monto: z
    .number({ message: "Ingresá el monto" })
    .positive("El monto tiene que ser mayor que cero")
    .max(999_999_999, "Ese monto es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 100)),
      "Como mucho dos decimales",
    ),
  nota: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
});

export type AccountAdjustmentValues = z.infer<typeof accountAdjustmentSchema>;

export const accountPaymentSchema = z.object({
  customerId: z.string().min(1, requerido),
  monto: z
    .number({ message: "Ingresá el monto" })
    .positive("El monto tiene que ser mayor que cero")
    .max(999_999_999, "Ese monto es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 100)),
      "Como mucho dos decimales",
    ),
  nota: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
});

export type AccountPaymentValues = z.infer<typeof accountPaymentSchema>;

export const voidAccountMovementSchema = z.object({
  movimientoId: z.string().min(1, requerido),
  motivo: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
});

export type VoidAccountMovementValues = z.infer<
  typeof voidAccountMovementSchema
>;
