import { z } from "zod";

const requerido = "Este campo es obligatorio";

/**
 * Schemas del módulo de Compras (migración 105).
 *
 * Mismo criterio que `stock-schemas.ts`: cada rango repite el CHECK de su
 * columna a propósito, para que el error aparezca debajo del campo mientras
 * la persona escribe y no como un mensaje de PostgreSQL después de mandar el
 * formulario entero.
 */

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

export const supplierSchema = z.object({
  nombre: z.string().trim().min(1, requerido).max(120, "Máximo 120 caracteres"),
  // Sin CUIT obligatorio: hay proveedores informales, y bloquear la carga por
  // ese campo es bloquear una compra real (migración 105).
  cuit: z.string().trim().max(20, "Máximo 20 caracteres").optional(),
  telefono: z.string().trim().max(30, "Máximo 30 caracteres").optional(),
  email: z
    .string()
    .trim()
    .max(160, "Máximo 160 caracteres")
    .email("Ese email no es válido")
    .optional()
    .or(z.literal("")),
});

export type SupplierValues = z.infer<typeof supplierSchema>;

const purchaseLineSchema = z.object({
  productoId: z.string().min(1, "Elegí el producto"),
  cantidad: cantidad("Ingresá la cantidad"),
  costoUnitario: pesos("Ingresá el costo unitario"),
});

export const purchaseSchema = z.object({
  proveedorId: z.string().min(1, "Elegí el proveedor"),
  nota: z.string().trim().max(280, "Máximo 280 caracteres").optional(),
  lineas: z.array(purchaseLineSchema).min(1, "Agregá al menos una línea"),
});

export type PurchaseValues = z.infer<typeof purchaseSchema>;
