import { z } from "zod";

/**
 * Schemas del módulo de Ventas (migración 108).
 *
 * Mismo criterio que `purchase-schemas.ts`: cada rango repite el CHECK de su
 * columna a propósito, para que el error aparezca debajo del campo mientras
 * la persona escribe.
 */

const PAYMENT_METHODS = [
  "efectivo",
  "tarjeta",
  "transferencia",
  "cuenta_corriente",
] as const;

const pesos = (mensaje: string) =>
  z
    .number({ message: mensaje })
    .min(0, "No puede ser negativo")
    .max(99_999_999, "Ese monto es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 100)),
      "Como mucho dos decimales",
    );

/** Cantidades con hasta tres decimales, igual que `NUMERIC(12,3)` en la base. */
const cantidad = (mensaje: string) =>
  z
    .number({ message: mensaje })
    .positive("La cantidad tiene que ser mayor que cero")
    .max(9_999_999, "Esa cantidad es demasiado grande")
    .refine(
      (valor) => Number.isInteger(Math.round(valor * 1000)),
      "Como mucho tres decimales",
    );

const saleLineSchema = z.object({
  productoId: z.string().min(1, "Elegí el producto"),
  cantidad: cantidad("Ingresá la cantidad"),
  precioUnitario: pesos("Ingresá el precio unitario"),
});

/**
 * `clienteId` queda vacío para "consumidor final" — solo `cuenta_corriente`
 * lo exige, y esa exigencia la hace el trigger `erp_account_movements_routing`
 * (108, ERP03) del lado de la base, no este schema: repetirla acá duplicaría
 * la regla en dos lugares que podrían desalinearse.
 */
export const saleSchema = z.object({
  clienteId: z.string().optional(),
  metodoPago: z.enum(PAYMENT_METHODS, {
    message: "Elegí el método de pago",
  }),
  lineas: z.array(saleLineSchema).min(1, "Agregá al menos una línea"),
});

export type SaleValues = z.infer<typeof saleSchema>;

export const voidSaleSchema = z.object({
  ventaId: z.string().min(1, "Este campo es obligatorio"),
  motivo: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
});

export type VoidSaleValues = z.infer<typeof voidSaleSchema>;
